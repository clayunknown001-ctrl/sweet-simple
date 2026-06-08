/**
 * AI Radar — Monitor v8.0  (Clean Architecture)
 *
 * GOLDEN RULE: 100% airtight blocking of harmful media — ZERO friction on safe content.
 *
 * Architecture principles (DO NOT REGRESS):
 *  1. Non-Destructive Interception
 *     - NEVER mutate <video>.src / .currentSrc / call .load() / strip attrs.
 *     - NEVER inject blur/cursor/pointer-events styles onto generic containers
 *       (a, button, [role=link], parent divs). Only the confirmed-bad media
 *       element itself or its dedicated overlay layer.
 *  2. Overlay-Only Blocking
 *     - When a media item is CONFIRMED harmful, we hide it visually AND drop
 *       an isolated absolutely-positioned overlay over its bounding box that
 *       captures pointer events (cursor:not-allowed, click swallowed).
 *     - Until that confirmation arrives, the element behaves 100% normally.
 *  3. Domain-Agnostic Observer
 *     - MutationObserver watches the whole document for IMG / VIDEO / SOURCE
 *       universally. No hardcoded YouTube/Insta selectors leak styles.
 *  4. Heuristic De-bias (sports / racing / leather suits)
 *     - Motion + non-flesh palette → toxicity score sharply reduced.
 *     - Local NSFW only fires hard-block when density ≥ 0.82.
 *  5. Cloud only on ambiguous (rate-limited). Cloud failure never blocks safe.
 *
 * Contracts preserved from prior versions:
 *  - postMessage IPC with nsfw-loader.js  ({__aiRadar:"classify"|"result"})
 *  - chrome.runtime "fetch-image" with background.js for CORS-bypassed bytes
 *  - chrome.storage.local stats keys consumed by popup.js
 */
(function () {
  "use strict";
  if (window.__AI_RADAR_LOADED__) return;
  window.__AI_RADAR_LOADED__ = true;

  // ───────────────────────────── Styles ─────────────────────────────
  // CRITICAL: no global rule touches generic elements. Only our own classes
  // attached to specific overlay/media nodes we created or confirmed.
  (function injectStyles() {
    if (document.getElementById("ai-radar-core-style")) return;
    const css = document.createElement("style");
    css.id = "ai-radar-core-style";
    css.textContent = `
.ai-radar-hidden-media{visibility:hidden!important}
.ai-radar-overlay{position:absolute;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(10,15,28,.97);color:#fff;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;text-align:center;padding:8px;border:2px solid #ef4444;border-radius:6px;box-shadow:0 0 0 1px rgba(239,68,68,.4),0 0 18px rgba(239,68,68,.3);pointer-events:auto;cursor:not-allowed;user-select:none;overflow:hidden}
.ai-radar-overlay .ico{font-size:22px;margin-bottom:2px}
.ai-radar-overlay .ttl{font-weight:700;color:#fca5a5;text-transform:uppercase;letter-spacing:1px;font-size:11px}
.ai-radar-overlay .rsn{opacity:.8;font-size:10px;max-width:92%;line-height:1.25;margin-top:2px}
.ai-radar-overlay .ico{font-size:18px}
@media(max-width:480px){.ai-radar-overlay .rsn{display:none}.ai-radar-overlay .ttl{font-size:10px}}
`;
    (document.head || document.documentElement).appendChild(css);
  })();

  // ───────────────────────────── Config ─────────────────────────────
  const API_BASE = "https://czxxfudupcikdomidbjl.supabase.co/functions/v1";
  const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6eHhmdWR1cGNpa2RvbWlkYmpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNzY2MDMsImV4cCI6MjA5NTY1MjYwM30.gWbO-U6srz-WC1DLUGkGGOpe2iB8kSCgpPgXJ3lrveo";

  const MIN_SIZE = 140;                  // ignore icons / avatars
  const MAX_CONCURRENT = 6;
  const LOCAL_BLOCK_THRESHOLD = 0.82;    // hard block only at ≥0.82 density
  const LOCAL_SUSPECT_THRESHOLD = 0.55;  // ambiguous → cloud check
  const CLOUD_RATE_LIMIT = 35;
  const CACHE_TTL_MS = 30 * 60 * 1000;

  // Domains where we never run (extension UI, internal)
  if (/^(chrome|edge|about|moz-extension|chrome-extension)/.test(location.protocol)) return;

  // Whitelist hosts — no scanning at all
  const HARD_WHITELIST = new Set([
    "wikipedia.org", "github.com", "stackoverflow.com",
    "google.com/search", "developer.mozilla.org",
  ]);

  // ───────────────────────────── State ──────────────────────────────
  const STATE = {
    paused: false,
    aiQuotaTripped: false,
    cloudCallsThisMinute: 0,
    cloudResetTimer: null,
    active: 0,
    queue: [],
    /** @type {Map<string,{verdict:"safe"|"bad"|"unknown",ts:number,reason?:string}>} */
    verdictCache: new Map(),
    /** @type {WeakMap<Element,{state:"pending"|"safe"|"bad",key:string}>} */
    elState: new WeakMap(),
    /** @type {WeakMap<Element,{overlay:HTMLElement,target:Element,raf:number}>} */
    overlays: new WeakMap(),
    nsfwReady: false,
    nsfwReqId: 0,
    nsfwPending: new Map(),
    stats: { totalBlocked: 0, localBlocked: 0, cloudBlocked: 0, localApproved: 0 },
  };

  // Load persisted state
  try {
    chrome.storage?.local?.get?.(
      ["totalBlocked", "localBlocked", "cloudBlocked", "localApproved", "paused"],
      (s) => {
        if (!s) return;
        STATE.stats.totalBlocked = s.totalBlocked || 0;
        STATE.stats.localBlocked = s.localBlocked || 0;
        STATE.stats.cloudBlocked = s.cloudBlocked || 0;
        STATE.stats.localApproved = s.localApproved || 0;
        STATE.paused = !!s.paused;
      }
    );
    chrome.storage?.onChanged?.addListener?.((c, area) => {
      if (area === "local" && c.paused) STATE.paused = !!c.paused.newValue;
    });
  } catch {}

  function persistStats(extra = {}) {
    try { chrome.storage?.local?.set?.({ ...STATE.stats, ...extra }); } catch {}
  }

  function recordBlock(kind, reason) {
    STATE.stats.totalBlocked++;
    if (kind === "local") STATE.stats.localBlocked++;
    else if (kind === "cloud") STATE.stats.cloudBlocked++;
    persistStats({ lastBlock: { reason, host: location.hostname, ts: Date.now() } });
  }

  // ─────────────────────────── NSFW IPC ─────────────────────────────
  (function injectNsfwLoader() {
    try {
      const url = chrome.runtime?.getURL?.("nsfw-loader.js");
      if (!url) return;
      const s = document.createElement("script");
      s.src = url;
      s.onload = () => s.remove();
      (document.head || document.documentElement).appendChild(s);
    } catch {}
  })();

  window.addEventListener("ai-radar-nsfw-ready", () => { STATE.nsfwReady = true; });
  window.addEventListener("message", (ev) => {
    if (ev.source !== window || !ev.data || ev.data.__aiRadar !== "result") return;
    const cb = STATE.nsfwPending.get(ev.data.id);
    if (cb) { STATE.nsfwPending.delete(ev.data.id); cb(ev.data); }
  });

  function classifyLocal(src, timeoutMs = 6000) {
    return new Promise((resolve) => {
      if (!STATE.nsfwReady) return resolve({ error: "not-ready" });
      const id = ++STATE.nsfwReqId;
      const t = setTimeout(() => {
        STATE.nsfwPending.delete(id);
        resolve({ error: "timeout" });
      }, timeoutMs);
      STATE.nsfwPending.set(id, (m) => { clearTimeout(t); resolve(m); });
      window.postMessage({ __aiRadar: "classify", id, src }, "*");
    });
  }

  // ─────────────────────────── URL hints ────────────────────────────
  const URL_HARD = /\b(porn|xxx|hentai|nsfw|sex(?:y|cam|chat)?|nude|naked|nudes|bikini|lingerie|onlyfans|cam(?:girl|whore)|escort)\b/i;
  const URL_SOFT = /\b(bra|thong|panties|booty|cleavage|underwear|swimsuit)\b/i;
  // Sports/safe vocab — overrides soft hints
  const URL_SAFE = /\b(motogp|formula1|f1|nascar|race|racing|football|soccer|basketball|cricket|tennis|olympic|highlight|tutorial|education|news|documentary|recipe|wikipedia)\b/i;

  function urlSignal(u) {
    if (!u) return 0;
    const s = u.toLowerCase();
    if (URL_SAFE.test(s)) return -0.4;
    if (URL_HARD.test(s)) return 0.9;
    if (URL_SOFT.test(s)) return 0.5;
    return 0;
  }

  function contextText(el) {
    const bits = [el.alt, el.title, el.getAttribute?.("aria-label")];
    const link = el.closest?.("a");
    if (link) bits.push(link.title, link.getAttribute("aria-label"));
    return bits.filter(Boolean).join(" ").toLowerCase();
  }

  // ─────────────────────────── Eligibility ──────────────────────────
  function isMediaCandidate(el) {
    if (!el || !el.isConnected) return false;
    if (el.tagName === "IMG") {
      const w = el.naturalWidth || el.width || 0;
      const h = el.naturalHeight || el.height || 0;
      if (Math.max(w, h) < MIN_SIZE) return false;
      const src = el.currentSrc || el.src || "";
      if (!src || src.startsWith("data:image/svg")) return false;
      return true;
    }
    if (el.tagName === "VIDEO") {
      const r = el.getBoundingClientRect();
      if (Math.max(r.width, r.height) < MIN_SIZE) return false;
      return true;
    }
    return false;
  }

  function hostWhitelisted() {
    const h = location.hostname + location.pathname;
    for (const w of HARD_WHITELIST) if (h.includes(w)) return true;
    return false;
  }

  // ─────────────────────────── Cache ────────────────────────────────
  function cacheKeyFor(el) {
    return el.tagName === "VIDEO"
      ? (el.currentSrc || el.src || el.dataset?.videoId || "video:" + (el.poster || ""))
      : (el.currentSrc || el.src || "");
  }
  function cacheGet(k) {
    const v = STATE.verdictCache.get(k);
    if (!v) return null;
    if (Date.now() - v.ts > CACHE_TTL_MS) { STATE.verdictCache.delete(k); return null; }
    return v;
  }
  function cacheSet(k, verdict, reason) {
    STATE.verdictCache.set(k, { verdict, ts: Date.now(), reason });
    if (STATE.verdictCache.size > 2000) {
      const first = STATE.verdictCache.keys().next().value;
      STATE.verdictCache.delete(first);
    }
  }

  // ─────────────────────────── Overlay ──────────────────────────────
  // Non-destructive blocker: hides target via visibility:hidden, drops an
  // absolutely-positioned sibling overlay over its bounding box. No parent
  // gets mutated. Overlay keeps itself aligned via rAF while target exists.
  function shield(target, reason) {
    if (STATE.overlays.has(target)) return;
    target.classList.add("ai-radar-hidden-media");
    if (target.tagName === "VIDEO") { try { target.pause(); } catch {} }

    const overlay = document.createElement("div");
    overlay.className = "ai-radar-overlay";
    overlay.innerHTML =
      `<div class="ico">🛡️</div><div class="ttl">BLOCKED</div><div class="rsn">${escapeHtml(reason || "Harmful content")}</div>`;

    // Swallow ALL pointer interactions over the overlay
    const swallow = (e) => { e.preventDefault(); e.stopPropagation(); };
    ["click", "mousedown", "mouseup", "auxclick", "contextmenu", "pointerdown", "touchstart"]
      .forEach((t) => overlay.addEventListener(t, swallow, true));

    document.body.appendChild(overlay);

    const reposition = () => {
      if (!target.isConnected) return cleanup();
      const r = target.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) {
        overlay.style.display = "none";
      } else {
        overlay.style.display = "flex";
        overlay.style.left = (r.left + window.scrollX) + "px";
        overlay.style.top = (r.top + window.scrollY) + "px";
        overlay.style.width = r.width + "px";
        overlay.style.height = r.height + "px";
      }
      rec.raf = requestAnimationFrame(reposition);
    };
    const cleanup = () => {
      try { cancelAnimationFrame(rec.raf); } catch {}
      try { overlay.remove(); } catch {}
      STATE.overlays.delete(target);
    };
    const rec = { overlay, target, raf: 0, cleanup };
    STATE.overlays.set(target, rec);
    rec.raf = requestAnimationFrame(reposition);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
  }

  // ──────────────────────── Heuristic scoring ────────────────────────
  // Combine NSFWJS preds with motion / palette de-bias.
  // preds: { Porn, Hentai, Sexy, Neutral, Drawing }
  function scoreFromPreds(preds, ctx = {}) {
    if (!preds) return 0;
    const porn = preds.Porn || 0;
    const hentai = preds.Hentai || 0;
    const sexy = preds.Sexy || 0;
    const neutral = preds.Neutral || 0;
    const drawing = preds.Drawing || 0;

    let score = porn * 1.0 + hentai * 0.95 + sexy * 0.55;
    // Strong-neutral or drawing → de-emphasize
    if (neutral > 0.7) score *= 0.55;
    if (drawing > 0.6 && porn < 0.4 && hentai < 0.4) score *= 0.5;

    // Motion / non-flesh palette → de-bias (sports, racing, gear)
    if (ctx.highMotion && ctx.lowFleshRatio) score *= 0.35;
    else if (ctx.highMotion) score *= 0.7;
    else if (ctx.lowFleshRatio) score *= 0.8;

    return Math.min(1, Math.max(0, score));
  }

  // Lightweight palette estimate for videos: sample a frame, compute flesh ratio.
  function estimateFleshRatio(mediaEl) {
    try {
      const canvas = document.createElement("canvas");
      const w = canvas.width = 64;
      const h = canvas.height = 64;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(mediaEl, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      let flesh = 0, total = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        total++;
        // Simple flesh heuristic
        if (r > 95 && g > 40 && b > 20 && r > g && r > b && (r - g) > 15 && Math.abs(r - g) < 80) flesh++;
      }
      return total ? flesh / total : 0;
    } catch { return 0.2; } // canvas tainted → neutral fallback
  }

  // ──────────────────────── Scan pipeline ────────────────────────────
  function enqueue(el) {
    if (STATE.paused || hostWhitelisted()) return;
    if (!isMediaCandidate(el)) return;
    const prev = STATE.elState.get(el);
    const key = cacheKeyFor(el);
    if (!key) return;
    if (prev && prev.key === key && prev.state !== "pending") return;

    // Cache hit?
    const cached = cacheGet(key);
    if (cached) {
      if (cached.verdict === "bad") shield(el, cached.reason || "Harmful content");
      STATE.elState.set(el, { state: cached.verdict === "bad" ? "bad" : "safe", key });
      return;
    }

    STATE.elState.set(el, { state: "pending", key });
    STATE.queue.push(el);
    pump();
  }

  function pump() {
    while (STATE.active < MAX_CONCURRENT && STATE.queue.length) {
      const el = STATE.queue.shift();
      if (!el || !el.isConnected) continue;
      STATE.active++;
      scan(el).finally(() => { STATE.active--; pump(); });
    }
  }

  async function scan(el) {
    const key = cacheKeyFor(el);
    if (!key) return finalize(el, key, "safe");

    // Layer 1 — URL / context text
    const ctxText = contextText(el) + " " + key;
    const urlS = urlSignal(ctxText);

    // Quick hard-bad path: explicit NSFW words AND not in safe vocab
    if (urlS >= 0.85) {
      return finalize(el, key, "bad", "URL/keyword: explicit");
    }

    // Layer 2 — Local NSFW classifier (images only, video sampled below)
    let preds = null;
    let ctx = { highMotion: false, lowFleshRatio: false };

    if (el.tagName === "IMG" && STATE.nsfwReady) {
      const res = await classifyLocal(key);
      if (!res.error) preds = res.preds || res;
    } else if (el.tagName === "VIDEO" && STATE.nsfwReady) {
      // Sample current frame; if low flesh ratio + motion, skip classification
      const fleshRatio = estimateFleshRatio(el);
      ctx.lowFleshRatio = fleshRatio < 0.08;
      // detect motion: compare two frames 80ms apart
      try {
        const a = grabFrame(el, 48);
        await new Promise((r) => setTimeout(r, 80));
        const b = grabFrame(el, 48);
        ctx.highMotion = motionDelta(a, b) > 0.18;
      } catch {}
      if (ctx.lowFleshRatio && ctx.highMotion) {
        // Sports / racing clear path
        return finalize(el, key, "safe");
      }
      // Classify the sampled frame via NSFW model
      try {
        const tmp = await canvasToDataUrl(el);
        if (tmp) {
          const res = await classifyLocal(tmp, 4000);
          if (!res.error) preds = res.preds || res;
        }
      } catch {}
    }

    const score = scoreFromPreds(preds, ctx) + Math.max(0, urlS);

    if (score >= LOCAL_BLOCK_THRESHOLD) {
      STATE.stats.localBlocked = (STATE.stats.localBlocked || 0);
      return finalize(el, key, "bad", "Local NSFW detector");
    }

    // Layer 3 — Cloud (only on ambiguity, only for IMG, only when allowed)
    if (
      el.tagName === "IMG" &&
      score >= LOCAL_SUSPECT_THRESHOLD &&
      canCallCloud()
    ) {
      try {
        const verdict = await cloudCheckImage(key);
        if (verdict.should_block) {
          STATE.stats.cloudBlocked = (STATE.stats.cloudBlocked || 0);
          return finalize(el, key, "bad", verdict.block_reason || "Cloud filter");
        }
      } catch {
        // Cloud failure on safe-leaning score → never block. Selective rule.
      }
    }

    finalize(el, key, "safe");
  }

  function finalize(el, key, verdict, reason) {
    cacheSet(key, verdict, reason);
    STATE.elState.set(el, { state: verdict === "bad" ? "bad" : "safe", key });
    if (verdict === "bad") {
      shield(el, reason || "Harmful content");
      recordBlock("local", reason || "Local NSFW detector");
    } else {
      STATE.stats.localApproved++;
      persistStats();
    }
  }

  // ─────────────────────────── Frame utils ──────────────────────────
  function grabFrame(media, size = 48) {
    const c = document.createElement("canvas");
    c.width = size; c.height = size;
    c.getContext("2d").drawImage(media, 0, 0, size, size);
    return c.getContext("2d").getImageData(0, 0, size, size).data;
  }
  function motionDelta(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let diff = 0, n = 0;
    for (let i = 0; i < a.length; i += 16) {
      diff += Math.abs(a[i] - b[i]);
      n++;
    }
    return (diff / n) / 255;
  }
  async function canvasToDataUrl(media) {
    try {
      const c = document.createElement("canvas");
      c.width = 224; c.height = 224;
      c.getContext("2d").drawImage(media, 0, 0, 224, 224);
      return c.toDataURL("image/jpeg", 0.7);
    } catch { return null; }
  }

  // ─────────────────────────── Cloud call ───────────────────────────
  function canCallCloud() {
    if (STATE.aiQuotaTripped) return false;
    if (STATE.cloudCallsThisMinute >= CLOUD_RATE_LIMIT) return false;
    STATE.cloudCallsThisMinute++;
    if (!STATE.cloudResetTimer) {
      STATE.cloudResetTimer = setTimeout(() => {
        STATE.cloudCallsThisMinute = 0;
        STATE.cloudResetTimer = null;
      }, 60_000);
    }
    return true;
  }

  async function cloudCheckImage(url) {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 8000);
    try {
      const resp = await fetch(`${API_BASE}/analyze-image`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": ANON_KEY,
          "Authorization": "Bearer " + ANON_KEY,
        },
        body: JSON.stringify({ image_url: url, fast: true }),
        signal: ctl.signal,
      });
      clearTimeout(to);
      if (resp.status === 429) { STATE.aiQuotaTripped = true; return { should_block: false }; }
      if (!resp.ok) return { should_block: false };
      return await resp.json();
    } catch {
      clearTimeout(to);
      return { should_block: false }; // never block on cloud error
    }
  }

  // ─────────────────────────── Observer ─────────────────────────────
  function scanRoot(root) {
    if (!root || !root.querySelectorAll) return;
    const list = root.querySelectorAll?.("img,video") || [];
    list.forEach((el) => enqueue(el));
    if (root.tagName === "IMG" || root.tagName === "VIDEO") enqueue(root);
  }

  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      m.addedNodes && m.addedNodes.forEach((n) => {
        if (n.nodeType === 1) scanRoot(n);
      });
      if (m.type === "attributes" && (m.target.tagName === "IMG" || m.target.tagName === "VIDEO")) {
        // Re-scan when src changes
        const st = STATE.elState.get(m.target);
        const key = cacheKeyFor(m.target);
        if (!st || st.key !== key) {
          // remove any stale overlay
          const ov = STATE.overlays.get(m.target);
          if (ov) { ov.cleanup?.(); }
          m.target.classList.remove("ai-radar-hidden-media");
          enqueue(m.target);
        }
      }
    }
  });

  function start() {
    try {
      mo.observe(document.documentElement, {
        childList: true, subtree: true,
        attributes: true, attributeFilter: ["src", "currentSrc", "poster"],
      });
    } catch {}
    scanRoot(document.body || document.documentElement);
    // Periodic sweep for lazy-loaded media that mutated outside observer
    setInterval(() => scanRoot(document.body), 2500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }

  console.log("[AI Radar] v8.0 monitor loaded (non-destructive, overlay-only)");
})();
