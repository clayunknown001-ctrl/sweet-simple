/**
 * AI Radar — Content Script v3
 * 3 qatlamli himoya:
 *   1. Whitelist/Blacklist (0ms, lokal)
 *   2. Lokal heuristics: skin-tone + URL/keyword (lokal, tekin)
 *   3. Cloud AI (faqat shubhali, kvota-cheklangan)
 */
(function () {
  "use strict";
  if (window.__AI_RADAR_LOADED__) return;
  window.__AI_RADAR_LOADED__ = true;

  const API_BASE = "https://iwyntbeqdvsbzvmskpaw.supabase.co/functions/v1";
  const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3eW50YmVxZHZzYnp2bXNrcGF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0NDkyOTYsImV4cCI6MjA4ODAyNTI5Nn0.dwvan4-1Mifxo6r3WzFqxmdMiByJ63h1Jk4rkvUrc0g";

  const MIN_SIZE = 150; // ikon va avatarlarni o'tkazib yubor
  const MAX_CONCURRENT = 3;
  const CACHE_KEY = "__ai_radar_cache_v3__";
  const PROCESSING = new WeakSet();
  const QUEUE = [];
  let active = 0;
  let blockedCount = 0;
  let aiDisabled = false;

  // ========== NSFW LOKAL MODEL (page-context'ga inject) ==========
  let nsfwReady = false;
  let nsfwReqId = 0;
  const nsfwPending = new Map();
  function injectNsfwLoader() {
    try {
      const url = chrome.runtime?.getURL?.("nsfw-loader.js");
      if (!url) return;
      const s = document.createElement("script");
      s.src = url;
      s.onload = () => s.remove();
      (document.head || document.documentElement).appendChild(s);
    } catch {}
  }
  injectNsfwLoader();
  window.addEventListener("message", (ev) => {
    if (!ev.data || ev.source !== window) return;
    const m = ev.data;
    if (m.__aiRadar === "result") {
      const cb = nsfwPending.get(m.id);
      if (cb) { nsfwPending.delete(m.id); cb(m); }
    }
  });
  window.addEventListener("ai-radar-nsfw-ready", () => { nsfwReady = true; });
  function classifyLocal(src, timeoutMs = 6000) {
    return new Promise((resolve) => {
      const id = ++nsfwReqId;
      const timer = setTimeout(() => { nsfwPending.delete(id); resolve({ error: "timeout" }); }, timeoutMs);
      nsfwPending.set(id, (m) => { clearTimeout(timer); resolve(m); });
      window.postMessage({ __aiRadar: "classify", id, src }, "*");
    });
  }
  // NSFWJS class'lari: Drawing, Hentai, Neutral, Porn, Sexy
  // v1.3: balanced — Porn/Hentai aniq blok, Sexy faqat juda yuqori, Neutral keng o'tkaziladi
  function decideFromNsfw(preds) {
    if (!preds) return null;
    const porn = preds.Porn || 0;
    const hentai = preds.Hentai || 0;
    const sexy = preds.Sexy || 0;
    const neutral = preds.Neutral || 0;
    const drawing = preds.Drawing || 0;
    if (porn > 0.60 || hentai > 0.60) return { block: true, reason: "Behayo kontent (lokal AI)", confident: true };
    if (sexy > 0.88 && neutral < 0.15) return { block: true, reason: "Erotik kontent (lokal AI)", confident: true };
    if (neutral > 0.70 || drawing > 0.75) return { block: false, confident: true };
    if (porn + hentai > 0.45) return { block: false, confident: false, suspicious: true };
    return { block: false, confident: true };
  }

  // ========== CACHE (localStorage, 7 kun) ==========
  let CACHE = {};
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const now = Date.now();
      for (const k in parsed) {
        if (parsed[k].t && now - parsed[k].t < 7 * 24 * 3600 * 1000) {
          CACHE[k] = parsed[k];
        }
      }
    }
  } catch {}
  let cacheDirty = false;
  function saveCache() {
    if (!cacheDirty) return;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(CACHE)); cacheDirty = false; } catch {}
  }
  setInterval(saveCache, 5000);

  function urlHash(url) {
    let h = 0;
    for (let i = 0; i < url.length; i++) h = ((h << 5) - h + url.charCodeAt(i)) | 0;
    return "u" + (h >>> 0).toString(36);
  }

  // ========== WHITELIST DOMAINS (AI'siz o'tkaz) ==========
  const WHITELIST_DOMAINS = [
    "wikipedia.org","wikimedia.org","github.com","stackoverflow.com","stackexchange.com",
    "google.com","gmail.com","drive.google.com","docs.google.com","calendar.google.com",
    "youtube.com","youtu.be","khanacademy.org","coursera.org","edx.org","udemy.com",
    "mit.edu","stanford.edu","harvard.edu","mdn.mozilla.org","developer.mozilla.org",
    "npmjs.com","nodejs.org","python.org","reactjs.org","react.dev","vuejs.org",
    "openai.com","anthropic.com","huggingface.co","kaggle.com","arxiv.org",
    "nytimes.com","bbc.com","bbc.co.uk","reuters.com","apnews.com","bloomberg.com",
    "amazon.com","ebay.com","aliexpress.com","etsy.com",
    "linkedin.com","medium.com","substack.com",
    "supabase.com","vercel.com","netlify.com","cloudflare.com","aws.amazon.com",
  ];
  function isWhitelisted() {
    const host = location.hostname.toLowerCase();
    return WHITELIST_DOMAINS.some((d) => host === d || host.endsWith("." + d));
  }
  const WHITELISTED = isWhitelisted();

  // ========== BLACKLIST (darhol blok) ==========
  const BLOCKED_DOMAINS = [
    "pornhub.com","xvideos.com","xhamster.com","redtube.com","youporn.com","spankbang.com",
    "onlyfans.com","chaturbate.com","stripchat.com","livejasmin.com","brazzers.com",
    "xnxx.com","tube8.com","beeg.com","tnaflix.com","motherless.com","efukt.com",
    "hentai.com","nhentai.net","e-hentai.org","rule34.xxx","fapdes.com",
  ];
  function isBlockedDomain() {
    const host = location.hostname.toLowerCase();
    return BLOCKED_DOMAINS.some((d) => host === d || host.endsWith("." + d));
  }

  // ========== KEYWORDS / URL PATTERNS ==========
  const RISKY_KEYWORDS = [
    "porn","porno","xxx","sex","sexy","nude","nudity","naked","nsfw","erotic","erotica","adult",
    "fetish","onlyfans","boobs","tits","nipple","pussy","vagina","penis","dick","cock",
    "bikini","lingerie","thong","swimsuit","seethrough","topless","cameltoe","upskirt",
    "downblouse","cleavage","milf","hentai","camgirl","escort","stripper","twerk","grinding",
    "masturbat","orgasm","thirst trap","thirst-trap","ahegao","gore","behead","decapitat",
    "suicide","selfharm","self-harm","cocaine","heroin","meth",
    "порно","секс","эрот","голая","голый","обнаж","сиськи","соски","писька","член",
    "купальник","нижнее белье","трусы","стринги","топлесс","декольте","шлюха","проститут",
    "эскорт","стриптиз","мастурб","оргазм","анал","минет","самоубий","наркотик",
    "behayo","yalang'och","yalangoch","ichki kiyim","kupalnik","fohisha","jinsi a'zo",
  ];
  const RISKY_URL_PATTERNS = [
    /\/porn/i, /\/xxx/i, /\/nsfw/i, /\/adult/i, /\/sex(?!ton|tan)/i, /\/nude/i, /\/erotic/i,
    /\/hentai/i, /\/onlyfans/i, /\/cam(girl|boy)/i, /\/bikini/i, /\/lingerie/i,
    /pornhub/i, /xvideos/i, /xhamster/i, /redtube/i, /youporn/i, /spankbang/i,
    /onlyfans/i, /chaturbate/i, /stripchat/i, /brazzers/i, /xnxx/i,
    /\/r\/(gonewild|nsfw|porn|nude|hentai)/i,
  ];

  function normalizeText(v) {
    try { return decodeURIComponent(String(v || "")).toLowerCase().replace(/\+/g, " "); }
    catch { return String(v || "").toLowerCase(); }
  }
  function containsRiskyKeyword(text) {
    const t = normalizeText(text);
    return t && RISKY_KEYWORDS.some((kw) => t.includes(kw));
  }
  function matchesRiskyUrl(url) {
    return RISKY_URL_PATTERNS.some((re) => re.test(url));
  }
  function collectContext(el, url) {
    const parts = [
      url, document.title, el.alt, el.title,
      el.getAttribute && el.getAttribute("aria-label"),
      el.closest && el.closest("a")?.href,
      el.closest && el.closest("a")?.textContent,
      el.parentElement?.textContent?.slice(0, 200),
    ];
    return parts.filter(Boolean).join(" ").slice(0, 1000);
  }
  function localBlockDecision(el, url) {
    if (matchesRiskyUrl(url)) return { block: true, reason: "Xavfli URL" };
    if (containsRiskyKeyword(collectContext(el, url))) return { block: true, reason: "Riskli kontekst" };
    return { block: false };
  }

  // ========== Domen blok ==========
  if (isBlockedDomain()) {
    const css = document.createElement("style");
    css.textContent = `.ai-radar-fullpage{position:fixed;inset:0;background:#0f172a;color:#fff;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:system-ui,sans-serif;padding:32px;text-align:center}.ai-radar-fullpage h1{color:#ef4444;font-size:32px;margin-bottom:12px}`;
    document.documentElement.appendChild(css);
    const overlay = document.createElement("div");
    overlay.className = "ai-radar-fullpage";
    overlay.innerHTML = `<div style="font-size:64px">🛡️</div><h1>Sayt bloklangan</h1><p>AI Radar bu saytni zararli kontent manbasi sifatida belgilagan.</p>`;
    document.documentElement.appendChild(overlay);
    return;
  }

  // ========== HARD-BLOCK SHIELD (mutlaqo ochib bo'lmaydi) ==========
  // 1x1 transparent PNG
  const BLANK_PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

  function shieldElement(el, reason) {
    if (el.dataset.aiRadarBlocked) return;
    el.dataset.aiRadarBlocked = "1";
    blockedCount++;
    try { chrome.runtime?.sendMessage?.({ type: "blocked", count: blockedCount }); } catch {}

    if (el.tagName === "IMG") {
      // 1. Asl URL'ni saqlab, src'ni transparent piksel bilan almashtirish
      try {
        if (el.src && el.src !== BLANK_PIXEL) el.dataset.aiRadarOrig = el.src;
        if (el.srcset) { el.dataset.aiRadarSrcset = el.srcset; el.removeAttribute("srcset"); }
        el.src = BLANK_PIXEL;
      } catch {}
    } else if (el.tagName === "VIDEO") {
      try {
        el.pause();
        el.muted = true;
        el.removeAttribute("autoplay");
        el.removeAttribute("controls");
        if (el.src) { el.dataset.aiRadarOrig = el.src; el.removeAttribute("src"); }
        // <source> teglarini ham o'chir
        el.querySelectorAll("source").forEach((s) => {
          s.dataset.aiRadarOrig = s.src;
          s.removeAttribute("src");
        });
        el.load();
        if (el.poster) { el.dataset.aiRadarOrigPoster = el.poster; el.poster = BLANK_PIXEL; }
      } catch {}
    }

    el.classList.add("ai-radar-blocked");
    el.style.pointerEvents = "none";

    // Parent <a> ga ham click bloklash
    const link = el.closest && el.closest("a");
    if (link && !link.dataset.aiRadarBlockedLink) {
      link.dataset.aiRadarBlockedLink = "1";
      link.dataset.aiRadarOrigHref = link.href;
      link.removeAttribute("href");
      link.style.cursor = "not-allowed";
      const blockClick = (e) => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); return false; };
      link.addEventListener("click", blockClick, { capture: true });
      link.addEventListener("mousedown", blockClick, { capture: true });
      link.addEventListener("auxclick", blockClick, { capture: true });
    }

    // Shield overlay
    const parent = el.parentElement;
    if (parent && getComputedStyle(parent).position === "static") {
      parent.style.position = "relative";
    }
    const shield = document.createElement("div");
    shield.className = "ai-radar-shield";
    shield.innerHTML = '<div class="icon">🛡️</div><div class="title">Bloklandi</div><div class="reason"></div>';
    shield.querySelector(".reason").textContent = (reason || "Zararli kontent").slice(0, 100);
    const r = el.getBoundingClientRect();
    shield.style.width = (r.width || el.offsetWidth || 200) + "px";
    shield.style.height = (r.height || el.offsetHeight || 200) + "px";
    // Shield'ga bosish ham hech narsa qilmaydi
    shield.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); }, { capture: true });
    el.insertAdjacentElement("afterend", shield);
  }

  // ========== LOKAL HEURISTICS: SKIN-TONE DETECTION ==========
  // Canvas orqali rasm pikselllarini o'qib, teri rangi foizini hisoblaydi.
  // Yuqori foiz + katta rasm + risky kontekst → blok.
  function analyzeSkinToneLocal(img) {
    return new Promise((resolve) => {
      try {
        if (!img.complete || !img.naturalWidth) return resolve({ skinPct: 0, error: true });
        const canvas = document.createElement("canvas");
        const W = 64, H = 64;
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        try {
          ctx.drawImage(img, 0, 0, W, H);
        } catch {
          // CORS block — skip
          return resolve({ skinPct: 0, error: true });
        }
        const data = ctx.getImageData(0, 0, W, H).data;
        let skin = 0, total = W * H;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2];
          // Klassik teri rangi heuristikasi (RGB)
          if (
            r > 95 && g > 40 && b > 20 &&
            r > g && r > b &&
            Math.abs(r - g) > 15 &&
            Math.max(r, g, b) - Math.min(r, g, b) > 15
          ) skin++;
        }
        resolve({ skinPct: skin / total, error: false });
      } catch {
        resolve({ skinPct: 0, error: true });
      }
    });
  }

  // ========== AI request ==========
  async function analyzeUrl(url) {
    if (aiDisabled) return { block: false, reason: "" };
    const key = urlHash(url);
    if (CACHE[key]) return { block: CACHE[key].b, reason: CACHE[key].r || "" };
    try {
      const res = await fetch(`${API_BASE}/analyze-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ANON_KEY}`, "apikey": ANON_KEY },
        body: JSON.stringify({ image_url: url, fast: true, language: "uz" }),
      });
      if (res.status === 402 || res.status === 429) {
        aiDisabled = true;
        console.warn("[AI Radar] AI quota tugadi — lokal filtr ishlaydi");
        return { block: false, reason: "" };
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const result = { block: !!data.should_block, reason: data.block_reason || data.category || "" };
      CACHE[key] = { b: result.block, r: result.reason, t: Date.now() };
      cacheDirty = true;
      return result;
    } catch (e) {
      return { block: false, reason: "" };
    }
  }
  async function analyzeBase64(base64) {
    if (aiDisabled) return { block: false, reason: "" };
    try {
      const res = await fetch(`${API_BASE}/analyze-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ANON_KEY}`, "apikey": ANON_KEY },
        body: JSON.stringify({ image_base64: base64, fast: true, language: "uz" }),
      });
      if (res.status === 402 || res.status === 429) { aiDisabled = true; return { block: false, reason: "" }; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return { block: !!data.should_block, reason: data.block_reason || data.category || "" };
    } catch { return { block: false, reason: "" }; }
  }

  // ========== Queue ==========
  function enqueue(task) { QUEUE.push(task); drain(); }
  function drain() {
    while (active < MAX_CONCURRENT && QUEUE.length) {
      const t = QUEUE.shift();
      active++;
      t().finally(() => { active--; drain(); });
    }
  }

  // ========== Scanners ==========
  async function processImage(img) {
    if (PROCESSING.has(img) || img.dataset.aiRadarBlocked) return;
    const url = img.currentSrc || img.src;
    if (!url || url === BLANK_PIXEL || url.startsWith("data:") || url.length < 10) return;
    if (img.naturalWidth && img.naturalWidth < MIN_SIZE) return;
    if (img.naturalHeight && img.naturalHeight < MIN_SIZE) return;

    PROCESSING.add(img);

    // 1. Local URL/keyword
    const local = localBlockDecision(img, url);
    if (local.block) { shieldElement(img, local.reason); return; }

    // 2. Whitelist domain → AI'siz o'tkaz
    if (WHITELISTED) return;

    img.classList.add("ai-radar-scanning");

    // 3. LOKAL NSFW MODEL (NSFWJS) — eng aniq, tekin, cheksiz
    if (nsfwReady) {
      const r = await classifyLocal(url);
      if (r && r.preds) {
        const decision = decideFromNsfw(r.preds);
        if (decision?.block) {
          img.classList.remove("ai-radar-scanning");
          shieldElement(img, decision.reason);
          return;
        }
        if (decision?.confident && !decision.block) {
          img.classList.remove("ai-radar-scanning");
          return; // aniq xavfsiz — cloud'ga yuborilmaydi
        }
        // shubhali → cloud'ga o'tadi
      }
    }

    // 4. Lokal skin-tone (NSFW yo'q bo'lsa fallback)
    const { skinPct, error } = await analyzeSkinToneLocal(img);
    img.classList.remove("ai-radar-scanning");

    const highSkin = !error && skinPct > 0.55 && img.naturalWidth >= 200;

    // 5. Cloud AI (faqat shubhali holatlarda, kvota tejash uchun)
    if (aiDisabled) {
      if (highSkin && skinPct > 0.7) shieldElement(img, "Ko'p ochiq teri (lokal)");
      return;
    }
    if (highSkin || (img.naturalWidth >= 300 && img.naturalHeight >= 300 && nsfwReady === false)) {
      enqueue(async () => {
        const { block, reason } = await analyzeUrl(url);
        if (block) shieldElement(img, reason);
      });
    }
  }

  function processVideo(video) {
    if (PROCESSING.has(video) || video.dataset.aiRadarBlocked) return;
    const poster = video.poster;
    const local = localBlockDecision(video, poster || video.currentSrc || video.src || "");
    if (local.block) { shieldElement(video, local.reason); return; }
    if (WHITELISTED) return;
    if (aiDisabled) return;

    PROCESSING.add(video);
    if (poster && !poster.startsWith("data:")) {
      enqueue(async () => {
        const { block, reason } = await analyzeUrl(poster);
        if (block) shieldElement(video, reason);
      });
    } else {
      captureFrame(video);
    }
  }

  function captureFrame(video) {
    if (aiDisabled) return;
    if (video.readyState < 2) {
      video.addEventListener("loadeddata", () => captureFrame(video), { once: true });
      return;
    }
    enqueue(async () => {
      try {
        const c = document.createElement("canvas");
        c.width = Math.min(video.videoWidth || 256, 384);
        c.height = Math.min(video.videoHeight || 256, 384);
        c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
        const b64 = c.toDataURL("image/jpeg", 0.6).split(",")[1];
        const { block, reason } = await analyzeBase64(b64);
        if (block) shieldElement(video, reason);
      } catch {}
    });
  }

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target;
      if (el.tagName === "IMG") processImage(el);
      else if (el.tagName === "VIDEO") processVideo(el);
      io.unobserve(el);
    }
  }, { rootMargin: "300px", threshold: 0.01 });

  function observe(el) {
    if (el.tagName === "IMG" || el.tagName === "VIDEO") io.observe(el);
  }

  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.tagName === "IMG" || node.tagName === "VIDEO") observe(node);
        node.querySelectorAll && node.querySelectorAll("img, video").forEach(observe);
      }
      // src o'zgargan rasmlarni qayta tekshirmaslik (biz o'zimiz BLANK_PIXEL'ga o'rnatamiz)
      if (m.type === "attributes" && (m.target.tagName === "IMG" || m.target.tagName === "VIDEO")) {
        if (m.target.dataset.aiRadarBlocked) {
          // Agar kimdir asl src'ni qayta tiklamoqchi bo'lsa — qayta blok
          const src = m.target.src || m.target.currentSrc;
          if (src && src !== BLANK_PIXEL && !src.startsWith("data:")) {
            try {
              if (m.target.tagName === "IMG") m.target.src = BLANK_PIXEL;
              else if (m.target.tagName === "VIDEO") { m.target.removeAttribute("src"); m.target.load(); }
            } catch {}
          }
        }
      }
    }
  });

  function start() {
    mo.observe(document.documentElement, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ["src", "poster", "srcset"],
    });
    document.querySelectorAll("img, video").forEach(observe);
    console.log(`%c[AI Radar v3] 🛡️ Faol — ${WHITELISTED ? "whitelist" : "to'liq monitoring"}`, "color:#10b981;font-weight:bold");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
