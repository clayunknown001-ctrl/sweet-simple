// Moderation memory: adaptive thresholds + feedback counts.
// In-memory per worker instance (acceptable for v1; DB persistence can be added).
// Survives within a warm function but resets on cold start — good enough for short-term learning.

import type { ContentCategory } from "./context.ts";

interface ThresholdEntry {
  blockThreshold: number;   // 0..1 — block only if confidence >= this
  updatedAt: number;
  falsePositives: number;
  missedHarm: number;
}

// Sensible defaults — bias toward NOT blocking benign categories
const DEFAULTS: Record<ContentCategory, number> = {
  // Safe categories: very high bar to block
  vehicle: 0.92, fitness: 0.90, education: 0.95, product: 0.90,
  scenery: 0.95, food: 0.95, family: 0.93, news: 0.92, tech: 0.95,
  entertainment: 0.88, fashion: 0.78,
  // Borderline / harmful: moderate-to-low bar
  "social-bait": 0.70,
  adult: 0.55, violence: 0.55, drugs: 0.60,
  hate: 0.55, selfharm: 0.55, scam: 0.65,
  neutral: 0.75,
};

const memory = new Map<ContentCategory, ThresholdEntry>();

function get(cat: ContentCategory): ThresholdEntry {
  if (!memory.has(cat)) {
    memory.set(cat, {
      blockThreshold: DEFAULTS[cat] ?? 0.75,
      updatedAt: Date.now(),
      falsePositives: 0,
      missedHarm: 0,
    });
  }
  return memory.get(cat)!;
}

export function getThreshold(cat: ContentCategory): number {
  return get(cat).blockThreshold;
}

export function getStats(cat: ContentCategory) {
  const e = get(cat);
  return { threshold: e.blockThreshold, falsePositives: e.falsePositives, missedHarm: e.missedHarm };
}

// EMA-based adjustment: each feedback nudges threshold by ~5%
export function recordFeedback(
  cat: ContentCategory,
  kind: "wrong_block" | "missed_harm",
): { threshold: number } {
  const e = get(cat);
  const alpha = 0.05;
  if (kind === "wrong_block") {
    e.falsePositives++;
    // Make it harder to block (raise threshold)
    e.blockThreshold = Math.min(0.99, e.blockThreshold + alpha * (1 - e.blockThreshold));
  } else {
    e.missedHarm++;
    // Make it easier to block (lower threshold)
    e.blockThreshold = Math.max(0.30, e.blockThreshold - alpha * e.blockThreshold);
  }
  e.updatedAt = Date.now();
  return { threshold: e.blockThreshold };
}

export function allStats() {
  const out: Record<string, ThresholdEntry> = {};
  for (const [k, v] of memory.entries()) out[k] = v;
  return out;
}

// Decision history cache: content_hash -> verdict (short-circuit re-analysis)
interface CachedDecision {
  verdict: any;
  ts: number;
}
const decisionCache = new Map<string, CachedDecision>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min

export function getCached(hash: string): any | null {
  const c = decisionCache.get(hash);
  if (!c) return null;
  if (Date.now() - c.ts > CACHE_TTL_MS) {
    decisionCache.delete(hash);
    return null;
  }
  return c.verdict;
}

export function setCached(hash: string, verdict: any): void {
  decisionCache.set(hash, { verdict, ts: Date.now() });
  if (decisionCache.size > 500) {
    // Trim oldest
    const oldest = [...decisionCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) decisionCache.delete(oldest[0]);
  }
}

export async function hashContent(s: string): Promise<string> {
  const data = new TextEncoder().encode(s.slice(0, 4096));
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}
