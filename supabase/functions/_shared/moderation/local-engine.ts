// Local Intelligence Layer — runs BEFORE any external API call.
// Produces a verdict + confidence using only heuristics so we can:
//   1. Short-circuit safe content (skip APIs entirely)
//   2. Short-circuit obviously extreme content
//   3. Provide a graceful "emergency" analysis when ALL providers fail
//
// Zero external dependencies. Deterministic. Fast.

import { analyzeContext, isHardHarmfulSignal } from "./context.ts";

export type LocalVerdict = "safe" | "uncertain" | "harmful";

export interface LocalResult {
  verdict: LocalVerdict;
  confidence: number;       // 0..1 — how sure we are about the verdict
  signals: string[];
  category: string;
  shouldBlock: boolean;
}

// ============ TEXT LAYER ============

const EXPLICIT_RX = /\b(porn|pornhub|xvideos|xnxx|onlyfans|hentai|nude|nudes|naked|sex(ual)?|fuck|cum|orgasm|penetrat|genital|nipple|erotic|fetish|blowjob|anal|incest|rape|pedo|loli|cp)\b/i;
const SEVERE_HARM_RX = /\b(suicide method|kill yourself|kys|behead|gore|massacre|terror attack|bomb.{0,10}making|child.{0,5}(sex|porn|abuse))\b/i;
const MILD_PROFANITY_RX = /\b(damn|hell|shit|crap|wtf|stfu)\b/i;
const SAFE_INTENT_RX = /\b(hello|hi|hey|thanks|thank you|please|good morning|good night|how are you|salom|rahmat|привет|спасибо|news|tutorial|how.?to|recipe|lesson|review|update|release|version|launch)\b/i;

export function analyzeTextLocal(text: string): LocalResult {
  const t = (text || "").trim();
  const signals: string[] = [];

  if (t.length === 0) {
    return { verdict: "safe", confidence: 1, signals: ["empty"], category: "neutral", shouldBlock: false };
  }
  if (t.length <= 3) {
    return { verdict: "safe", confidence: 1, signals: ["trivial-length"], category: "neutral", shouldBlock: false };
  }

  const ctx = analyzeContext({}, t);
  const isSafeCat = ctx.isSafeCategory;
  const explicit = EXPLICIT_RX.test(t);
  const severe = SEVERE_HARM_RX.test(t);
  const safeIntent = SAFE_INTENT_RX.test(t);
  const mild = MILD_PROFANITY_RX.test(t);

  if (severe) {
    signals.push("severe-harm-pattern");
    return { verdict: "harmful", confidence: 0.95, signals, category: ctx.category, shouldBlock: true };
  }
  if (explicit && !isSafeCat) {
    signals.push("explicit-pattern");
    return { verdict: "harmful", confidence: 0.85, signals, category: ctx.harmfulSignals[0] ?? "adult", shouldBlock: true };
  }
  if (isSafeCat && !explicit && !severe) {
    signals.push(`safe-category:${ctx.category}`);
    if (safeIntent) signals.push("safe-intent");
    return { verdict: "safe", confidence: 0.9, signals, category: ctx.category, shouldBlock: false };
  }
  if (safeIntent && t.length < 120 && !explicit) {
    signals.push("short-safe-intent");
    return { verdict: "safe", confidence: 0.85, signals, category: ctx.category, shouldBlock: false };
  }
  if (mild && !explicit) signals.push("mild-profanity-only");

  return { verdict: "uncertain", confidence: 0.4, signals, category: ctx.category, shouldBlock: false };
}

// ============ URL / VISUAL LAYER ============

const UNSAFE_DOMAIN_RX = /\b(pornhub|xvideos|xnxx|redtube|youporn|onlyfans|chaturbate|stripchat|brazzers|hentai|rule34|e621|spankbang|tnaflix)\b/i;
const SAFE_DOMAIN_RX = /\b(youtube|youtu\.be|wikipedia|github|stackoverflow|google|bing|microsoft|apple|coursera|udemy|khanacademy|w3schools|mdn|developer\.mozilla)\b/i;

export function analyzeUrlLocal(url?: string): LocalResult {
  const u = (url || "").toLowerCase();
  if (!u) return { verdict: "uncertain", confidence: 0.3, signals: ["no-url"], category: "neutral", shouldBlock: false };
  if (UNSAFE_DOMAIN_RX.test(u)) {
    return { verdict: "harmful", confidence: 0.95, signals: ["unsafe-domain"], category: "adult", shouldBlock: true };
  }
  if (SAFE_DOMAIN_RX.test(u)) {
    return { verdict: "safe", confidence: 0.85, signals: ["safe-domain"], category: "tech", shouldBlock: false };
  }
  return { verdict: "uncertain", confidence: 0.3, signals: ["unknown-domain"], category: "neutral", shouldBlock: false };
}

// ============ EMERGENCY FALLBACK ============
// When all APIs fail, build a minimal analysis object so the app keeps working.

export function buildEmergencyTextAnalysis(text: string, language: string): any {
  const local = analyzeTextLocal(text);
  return {
    summary: local.verdict === "harmful" ? "Lokal mode: shubhali kontent" : "Lokal mode: kontent xavfsiz ko'rinadi",
    language,
    sentiment: "neutral",
    sentiment_score: 0,
    topics: [],
    word_count: text.trim().split(/\s+/).filter(Boolean).length,
    reading_time_minutes: Math.max(0.1, text.length / 1000),
    content_type: local.category,
    tone: "neutral",
    key_entities: [],
    harmful_content: {
      is_harmful: local.shouldBlock,
      severity: local.shouldBlock ? "high" : "none",
      categories: local.shouldBlock ? [local.category] : [],
      details: local.signals.join(", "),
      flagged_phrases: [],
    },
    should_block: local.shouldBlock,
    block_reason: local.shouldBlock ? `Local engine: ${local.signals.join(", ")}` : "",
    confidence: local.confidence,
    _local_only: true,
    _signals: local.signals,
  };
}

export function buildEmergencyImageAnalysis(url?: string): any {
  const local = analyzeUrlLocal(url);
  return {
    description: "Lokal mode (API mavjud emas) — URL heuristikasi",
    objects: [],
    scene_type: local.category,
    mood: "neutral",
    colors: [],
    text_in_image: "",
    nsfw_probability: local.shouldBlock ? 0.9 : 0.05,
    harmful_content: {
      is_harmful: local.shouldBlock,
      severity: local.shouldBlock ? "high" : "none",
      categories: local.shouldBlock ? [local.category] : [],
      details: local.signals.join(", "),
    },
    should_block: local.shouldBlock,
    block_reason: local.shouldBlock ? `Local engine: ${local.signals.join(", ")}` : "",
    confidence: local.confidence,
    _local_only: true,
    _signals: local.signals,
  };
}

export function buildEmergencyVideoAnalysis(url?: string): any {
  const local = analyzeUrlLocal(url);
  return {
    description: "Lokal mode (API mavjud emas) — URL heuristikasi",
    duration_estimate: "unknown",
    scene_type: local.category,
    actions: [],
    objects: [],
    speech_summary: "",
    mood: "neutral",
    nsfw_probability: local.shouldBlock ? 0.9 : 0.05,
    harmful_content: {
      is_harmful: local.shouldBlock,
      severity: local.shouldBlock ? "high" : "none",
      categories: local.shouldBlock ? [local.category] : [],
      details: local.signals.join(", "),
    },
    should_block: local.shouldBlock,
    block_reason: local.shouldBlock ? `Local engine: ${local.signals.join(", ")}` : "",
    confidence: local.confidence,
    _local_only: true,
    _signals: local.signals,
  };
}
