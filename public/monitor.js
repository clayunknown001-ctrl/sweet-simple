/* AI Radar v9.1 — Electron-safe build */
(function() {
try {
(function _main_() {

  "use strict";
  // Electron/browser environment safety guard
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__AI_RADAR_LOADED__) return;
  window.__AI_RADAR_LOADED__ = true;
  // chrome API safety shim — agar yo'q bo'lsa stub object
  var _chrome = (typeof chrome !== 'undefined' && chrome) ? chrome : {};
  var _chromeStorage = (_chrome.storage && _chrome.storage.local) ? _chrome.storage.local : { get: function(){}, set: function(){} };
  var _chromeRuntime = (_chrome.runtime) ? _chrome.runtime : { sendMessage: function(){}, getURL: function(p){ return p; } };


  // =====================================================================
  // STYLES
  // =====================================================================
  function injectCoreStyles() {
    if (document.getElementById("ai-radar-core-style")) return;
    const css = document.createElement("style");
    css.id = "ai-radar-core-style";
    css.textContent = `
.ai-radar-pre-blur{filter:blur(28px)!important;transition:none!important;pointer-events:none!important;user-select:none!important}
.ai-radar-blocked{pointer-events:none!important;user-select:none!important}
.ai-radar-wrapper{position:relative!important;display:inline-block!important;vertical-align:middle;background:#0a0f1c;border-radius:6px;overflow:hidden}
.ai-radar-shield{position:absolute!important;top:0!important;right:0!important;bottom:0!important;left:0!important;background:rgba(10,15,28,.98);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;text-align:center;padding:10px;z-index:2147483647;border:2px solid #ef4444;border-radius:6px;box-shadow:0 0 0 1px rgba(239,68,68,.4),0 0 20px rgba(239,68,68,.3);pointer-events:auto!important;cursor:not-allowed!important;user-select:none}
.ai-radar-shield .icon{font-size:26px;margin-bottom:4px}
.ai-radar-shield .title{font-weight:700;color:#fca5a5;margin-bottom:4px;text-transform:uppercase;letter-spacing:1px}
.ai-radar-shield .reason{opacity:.85;font-size:10px;max-width:90%;line-height:1.3}
.ai-radar-fullpage{position:fixed;top:0;right:0;bottom:0;left:0;background:#0f172a;color:#fff;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:system-ui,sans-serif;padding:32px;text-align:center}
.ai-radar-fullpage h1{color:#ef4444;font-size:32px;margin-bottom:12px}`;
    (document.head || document.documentElement).appendChild(css);
  }
  injectCoreStyles();

  // =====================================================================
  // CONFIG
  // =====================================================================
  const API_BASE       = "https://czxxfudupcikdomidbjl.supabase.co/functions/v1";
  const ANON_KEY       = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6eHhmdWR1cGNpa2RvbWlkYmpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNzY2MDMsImV4cCI6MjA5NTY1MjYwM30.gWbO-U6srz-WC1DLUGkGGOpe2iB8kSCgpPgXJ3lrveo";
  const MIN_SIZE       = 100;   // px — kichik iconlarni o'tkazib yubor
  const MAX_CONCURRENT = 6;
  const CLOUD_RATE_LIMIT = 35;
  const CACHE_KEY      = "__ai_radar_cache_v12__";
  const BLANK_PIXEL    = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  const STOP_EVENTS    = ["click","mousedown","mouseup","pointerdown","pointerup","touchstart","auxclick","contextmenu"];

  // =====================================================================
  // STATE
  // =====================================================================
  const PROCESSING = new WeakMap();
  const QUEUE = [];
  let active = 0;
  let blockedCount = 0;
  let aiDisabled   = false;
  let cloudCallsThisMinute = 0;
  let cloudMinuteTimer     = null;
  let localOnlyMode  = false;
  let localOnlyUntil = 0;
  let paused         = false;
  let nsfwReady      = false;
  let nsfwReqId      = 0;
  const nsfwPending  = new Map();
  const stats = { totalBlocked:0, localBlocked:0, cloudBlocked:0, localApproved:0 };

  // =====================================================================
  // CHROME STORAGE
  // =====================================================================
  try {
    chrome.storage?.local?.get?.(["totalBlocked","localBlocked","cloudBlocked","localApproved","paused"], s => {
      if (!s) return;
      stats.totalBlocked  = s.totalBlocked  || 0;
      stats.localBlocked  = s.localBlocked  || 0;
      stats.cloudBlocked  = s.cloudBlocked  || 0;
      stats.localApproved = s.localApproved || 0;
      paused       = !!s.paused;
      blockedCount = stats.totalBlocked;
    });
    chrome.storage?.onChanged?.addListener?.((changes, area) => {
      if (area === "local" && changes.paused) paused = !!changes.paused.newValue;
    });
  } catch {}

  function persistStats(extra = {}) {
    try { chrome.storage?.local?.set?.({ ...stats, ...extra }); } catch {}
  }
  function noteLocalApproved() { stats.localApproved++; persistStats(); }

  // =====================================================================
  // RATE LIMIT
  // =====================================================================
  function canCallCloud() {
    if (aiDisabled) return false;
    if (cloudMinuteTimer === null) {
      cloudMinuteTimer = setTimeout(() => {
        cloudCallsThisMinute = 0;
        cloudMinuteTimer = null;
        if (localOnlyMode && Date.now() >= localOnlyUntil) {
          localOnlyMode = false;
        }
      }, 60000);
    }
    if (cloudCallsThisMinute >= CLOUD_RATE_LIMIT) {
      if (!localOnlyMode) { localOnlyMode = true; localOnlyUntil = Date.now() + 60000; }
      return false;
    }
    cloudCallsThisMinute++;
    return true;
  }
  function tripAiQuota() {
    aiDisabled = true; localOnlyMode = true; localOnlyUntil = Date.now() + 5 * 60000;
    setTimeout(() => { aiDisabled = false; cloudCallsThisMinute = 0; localOnlyMode = false; }, 5 * 60000);
  }

  // =====================================================================
  // HOST DETECTION
  // =====================================================================
  function hostMatches(domains) {
    const h = location.hostname.toLowerCase().replace(/^www\./, "");
    return domains.some(d => h === d || h.endsWith("." + d));
  }
  const VISUAL_RISK_DOMAINS = [
    "instagram.com","pinterest.com","tiktok.com","youtube.com","youtu.be",
    "x.com","twitter.com","reddit.com","threads.net","snapchat.com",
  ];
  const SEARCH_ENGINE_DOMAINS = [
    "google.com","duckduckgo.com","bing.com","yandex.com","yandex.ru",
    "yahoo.com","baidu.com","search.brave.com",
  ];
  const VISUAL_RISK_HOST   = hostMatches(VISUAL_RISK_DOMAINS);
  const SEARCH_ENGINE_HOST = hostMatches(SEARCH_ENGINE_DOMAINS);
  const YOUTUBE_HOST       = hostMatches(["youtube.com","youtu.be"]);
  const HIGH_RISK_HOST     = VISUAL_RISK_HOST || SEARCH_ENGINE_HOST;

  // =====================================================================
  // CACHE
  // =====================================================================
  let CACHE = {};
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const now = Date.now();
      for (const k in parsed)
        if (parsed[k].t && now - parsed[k].t < 7 * 86400000) CACHE[k] = parsed[k];
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

  // =====================================================================
  // BLACKLIST / WHITELIST
  // =====================================================================
  const BLOCKED_DOMAINS = [
    "pornhub.com","xvideos.com","xhamster.com","redtube.com","youporn.com","spankbang.com",
    "onlyfans.com","chaturbate.com","stripchat.com","livejasmin.com","brazzers.com",
    "xnxx.com","tube8.com","beeg.com","tnaflix.com","motherless.com","efukt.com",
    "hentai.com","nhentai.net","e-hentai.org","rule34.xxx","fapdes.com",
  ];
  const WHITELIST_DOMAINS = [
    "wikipedia.org","wikimedia.org","github.com","stackoverflow.com","stackexchange.com",
    "gmail.com","drive.google.com","docs.google.com","calendar.google.com",
    "khanacademy.org","coursera.org","edx.org","udemy.com","mit.edu","stanford.edu",
    "harvard.edu","mdn.mozilla.org","developer.mozilla.org","npmjs.com","nodejs.org",
    "python.org","reactjs.org","react.dev","vuejs.org","openai.com","anthropic.com",
    "huggingface.co","kaggle.com","arxiv.org","nytimes.com","bbc.com","bbc.co.uk",
    "reuters.com","apnews.com","bloomberg.com","amazon.com","ebay.com","aliexpress.com",
    "etsy.com","linkedin.com","medium.com","substack.com",
    "supabase.com","vercel.com","netlify.com","cloudflare.com","aws.amazon.com",
  ];
  let USER_WHITELIST = [];
  try {
    chrome.storage?.local?.get?.(["userWhitelist"], s => {
      if (Array.isArray(s?.userWhitelist)) USER_WHITELIST = s.userWhitelist;
    });
    chrome.storage?.onChanged?.addListener?.((c, area) => {
      if (area === "local" && c.userWhitelist)
        USER_WHITELIST = Array.isArray(c.userWhitelist.newValue) ? c.userWhitelist.newValue : [];
    });
  } catch {}
  function isBlockedDomain() {
    const h = location.hostname.toLowerCase();
    return BLOCKED_DOMAINS.some(d => h === d || h.endsWith("." + d));
  }
  function isWhitelisted() {
    const h = location.hostname.toLowerCase();
    const user = USER_WHITELIST.map(d => String(d).toLowerCase());
    if (user.some(d => h === d || h.endsWith("." + d))) return true;
    if (HIGH_RISK_HOST) return false;
    return WHITELIST_DOMAINS.some(d => h === d || h.endsWith("." + d));
  }
  let WHITELISTED = isWhitelisted();
  setInterval(() => { WHITELISTED = isWhitelisted(); }, 5000);

  // =====================================================================
  // KEYWORD LISTS
  // =====================================================================
  const EXACT_KWS = new Set(["anal","cum","meth","dick","cock","ass","butt","gore","nude","sex","tits","boobs","hips","dance","model","raqs"]);

  const HARD_BLOCK_KWS = [
    "porn","porno","xxx","nsfw","nude","naked","nudity","topless","onlyfans","hentai",
    "sex tape","sexual","stripper","camgirl","fetish","boobs","tits","nipple",
    "pussy","vagina","penis","dick","cock","masturbat","orgasm","blowjob","anal","cum",
    "gore","behead","suicide","self-harm","cocaine","heroin","meth",
    "порно","голая","голый","обнаж","сиськи","соски","член","топлесс","мастурб","оргазм",
    "yalang'och","yalangoch","behayo","jinsi a'zo",
  ];
  const SOFT_RISK_KWS = [
    "sexy","erotic","lingerie","thong","bikini","swimsuit","cleavage","twerk","grinding",
    "bodycon","booty","big ass","big butt","thirst trap","see through","upskirt","cameltoe",
    "hot girl","sexy girl","naughty girl","naughty","ahegao","cosplay","seductive",
    "erotika","erotik","hot girls","sexy girls","bikni",
    "бикини","купальник","декольте","стринги","эрот","облегающ",
    "kupalnik","ichki kiyim","tor kiyim","ochiq kiyim","ko'krak","kokrak",
  ];
  const RISKY_URL_PATTERNS = [
    /\/porn/i,/\/xxx/i,/\/nsfw/i,/\/adult/i,/\/sex(?!ton|tan)/i,/\/nude/i,/\/erotic/i,
    /\/hentai/i,/\/onlyfans/i,/\/cam(girl|boy)/i,/\/bikini/i,/\/lingerie/i,
    /erotik/i,/erotiqa/i,/bikni/i,
    /pornhub/i,/xvideos/i,/xhamster/i,/redtube/i,/youporn/i,/spankbang/i,
    /onlyfans/i,/chaturbate/i,/stripchat/i,/brazzers/i,/xnxx/i,
    /\/r\/(gonewild|nsfw|porn|nude|hentai)/i,
  ];

  function normalizeText(v) {
    try { return decodeURIComponent(String(v || "")).toLowerCase().replace(/\+/g, " "); }
    catch { return String(v || "").toLowerCase(); }
  }
  function checkKWs(text, list) {
    const t = normalizeText(text);
    if (!t) return false;
    for (const kw of list) {
      if (EXACT_KWS.has(kw)) {
        if (new RegExp(`(?:^|[^\\p{L}])${kw}(?:[^\\p{L}]|$)`, "iu").test(t)) return true;
      } else {
        if (t.includes(kw)) return true;
      }
    }
    return false;
  }
  const isHardRisk = t => checkKWs(t, HARD_BLOCK_KWS);
  const isSoftRisk = t => checkKWs(t, SOFT_RISK_KWS);
  const isRiskyUrl = url => RISKY_URL_PATTERNS.some(re => re.test(url));

  // =====================================================================
  // PAGE CONTEXT — bir marta hisoblanadi
  // =====================================================================
  function getSearchQuery() {
    try {
      const p = new URLSearchParams(location.search);
      return (p.get("q") || p.get("query") || p.get("search_query") || "").toLowerCase();
    } catch { return ""; }
  }
  const PAGE_SEARCH_QUERY = getSearchQuery();
  const PAGE_URL_LOWER    = (() => { try { return decodeURIComponent(location.href).toLowerCase(); } catch { return location.href.toLowerCase(); } })();
  const PAGE_TITLE_LOWER  = (document.title || "").toLowerCase();
  const PAGE_COMBINED     = PAGE_URL_LOWER + " " + PAGE_TITLE_LOWER + " " + PAGE_SEARCH_QUERY;

  // 0 = toza, 1 = shubhali (soft), 2 = qat'iy risky (hard)
  const PAGE_RISK_LEVEL = (() => {
    if (isRiskyUrl(location.href) || isHardRisk(PAGE_COMBINED)) return 2;
    if (isSoftRisk(PAGE_COMBINED) || isHardRisk(PAGE_SEARCH_QUERY)) return 2;
    if (isSoftRisk(PAGE_SEARCH_QUERY)) return 1;
    return 0;
  })();
  const PAGE_RISKY = PAGE_RISK_LEVEL >= 1;

  console.log(`%c[AI Radar v9.0] Risk:${PAGE_RISK_LEVEL} | Query:"${PAGE_SEARCH_QUERY}" | SE:${SEARCH_ENGINE_HOST} | YT:${YOUTUBE_HOST}`, "color:#10b981;font-weight:bold");

  // =====================================================================
  // ELEMENT HELPERS
  // =====================================================================
  function collectContext(el, url) {
    const parts = [
      el.alt, el.title,
      el.getAttribute?.("aria-label"),
      el.closest?.("a")?.textContent?.slice(0, 80),
      el.closest?.("ytd-rich-item-renderer,ytd-reel-video-renderer,ytd-video-renderer,ytd-compact-video-renderer")?.textContent?.slice(0, 200),
      url, PAGE_SEARCH_QUERY,
    ];
    return parts.filter(Boolean).join(" ").slice(0, 600);
  }
  function mediaUrl(el) {
    const srcset = el.srcset || el.getAttribute?.("srcset") || "";
    const candidates = srcset ? String(srcset).split(",").map(p => p.trim().split(/\s+/)[0]).filter(Boolean) : [];
    const srcsetUrl = candidates[candidates.length - 1] || "";
    return [
      el.currentSrc, el.src, srcsetUrl,
      el.getAttribute?.("data-src"), el.getAttribute?.("data-original"),
      el.getAttribute?.("data-lazy-src"), el.getAttribute?.("data-actualsrc"),
    ].find(u => u && u !== BLANK_PIXEL) || "";
  }
  function extractYouTubeId(text) {
    const s = String(text || location.href);
    return s.match(/(?:youtube\.com\/watch\?v=|youtube\.com\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{6,})/)?.[1]
      || s.match(/[?&]v=([a-zA-Z0-9_-]{6,})/)?.[1]
      || s.match(/\/shorts\/([a-zA-Z0-9_-]{6,})/)?.[1] || "";
  }
  function extractYouTubeIdFromElement(el) {
    const ctx = [
      el?.src, el?.currentSrc, el?.href,
      el?.closest?.("a")?.href,
      el?.closest?.("ytd-rich-item-renderer,ytd-video-renderer,ytd-reel-item-renderer,ytd-reel-video-renderer,ytd-thumbnail")?.querySelector?.("a[href]")?.href,
      el?.closest?.("ytd-rich-item-renderer,ytd-video-renderer,ytd-reel-item-renderer,ytd-reel-video-renderer,ytd-thumbnail")?.innerHTML?.slice(0, 1200),
      location.href,
    ].filter(Boolean).join(" ");
    return extractYouTubeId(ctx);
  }
  function youtubeThumbs(id) {
    if (!id) return [];
    return [
      `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
      `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
    ];
  }
  function analysisUrlsForElement(el, primaryUrl) {
    const urls = [primaryUrl];
    if (YOUTUBE_HOST) urls.push(...youtubeThumbs(extractYouTubeIdFromElement(el)));
    return [...new Set(urls.filter(Boolean))];
  }
  function mediaVisibleSize(el) {
    const r = el.getBoundingClientRect();
    return {
      w: r.width  || el.offsetWidth  || el.naturalWidth  || el.videoWidth  || 0,
      h: r.height || el.offsetHeight || el.naturalHeight || el.videoHeight || 0,
    };
  }

  // =====================================================================
  // QATLAM 1 — KEYWORD QAROR (sinxron, 0ms)
  // =====================================================================
  function keywordDecide(el, url) {
    const mediaCtx = [url, el.alt, el.title, el.getAttribute?.("aria-label")].filter(Boolean).join(" ");
    const fullCtx  = collectContext(el, url);

    // Qat'iy blok
    if (isRiskyUrl(url) || isHardRisk(mediaCtx) || isHardRisk(fullCtx))
      return { block: true, suspicious: false, reason: "Xavfli media/kontekst" };

    // Shubhali
    if (isSoftRisk(mediaCtx) || isSoftRisk(fullCtx))
      return { block: false, suspicious: true, reason: "Shubhali kontent" };

    return { block: false, suspicious: false, reason: "" };
  }

  // =====================================================================
  // QATLAM 2 — CANVAS VISUAL ANALYZER
  //
  // Bu funksiya CLOUD yoki NSFW modelga umuman tayanmaydi.
  // Faqat Canvas API — browser ichida sinxron ishlaydi.
  //
  // NIMA TEKSHIRILADI:
  //   1. Skin-tone piksel foizi (RGB + YCbCr dual model)
  //   2. Bare skin cluster — yirik bir renk dolag'i (badanning katta qismi)
  //   3. Background simplicity — fon oddiy/yagona rangmi (studio foto belgisi)
  //   4. Warm color dominance — sariq/qizg'ish tonlar
  //   5. Low texture entropy — piksellar o'xshash (kiyim yo'q, fon yo'q)
  //
  // QAROR MANTIQ:
  //   - score >= BLOCK_THRESHOLD → block: true
  //   - score >= SUSPECT_THRESHOLD → suspicious: true
  //   - score < SUSPECT_THRESHOLD → clean: true
  // =====================================================================
  function canvasAnalyzeImage(img, strict = false) {
    return new Promise(resolve => {
      try {
        if (!img.complete || !img.naturalWidth) return resolve({ block: false, suspicious: false, clean: true, score: 0, err: "not_loaded" });

        const SIZE = 96; // 96x96 tahlil uchun yetarli
        const canvas = document.createElement("canvas");
        canvas.width = SIZE; canvas.height = SIZE;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });

        try { ctx.drawImage(img, 0, 0, SIZE, SIZE); }
        catch { return resolve({ block: false, suspicious: false, clean: true, score: 0, err: "cors" }); }

        const data = ctx.getImageData(0, 0, SIZE, SIZE).data;
        const total = SIZE * SIZE;

        let skinCount = 0;       // RGB skin
        let ycbcrSkin = 0;       // YCbCr skin (aniqroq)
        let warmCount = 0;       // warm (sariq, to'q sariq, jigarrang) piksellari
        let rSum = 0, gSum = 0, bSum = 0;  // o'rtacha rang
        let entropyBuckets = new Uint32Array(64); // texture entropy

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i+1], b = data[i+2];

          // 1. RGB skin model
          const rgbSkin = r > 95 && g > 40 && b > 20
            && r > g && r > b
            && Math.abs(r - g) > 15
            && (Math.max(r,g,b) - Math.min(r,g,b)) > 15;
          if (rgbSkin) skinCount++;

          // 2. YCbCr skin model (aniqroq, kiyimdagi teri ranglarini ham tutadi)
          const Y  =  0.299*r + 0.587*g + 0.114*b;
          const Cb = -0.169*r - 0.331*g + 0.500*b + 128;
          const Cr =  0.500*r - 0.419*g - 0.081*b + 128;
          const ycSkin = Y > 80 && Cb >= 77 && Cb <= 127 && Cr >= 133 && Cr <= 173;
          if (ycSkin) ycbcrSkin++;

          // 3. Warm tone
          if (r > 150 && g > 80 && b < 100 && r > g && r > b) warmCount++;

          // Accumulate for averages
          rSum += r; gSum += g; bSum += b;

          // Entropy bucket
          const bucket = Math.floor(r / 4) + Math.floor(g / 64) + Math.floor(b / 256);
          entropyBuckets[Math.min(63, bucket)]++;
        }

        // Dominant skin: take the higher of two models
        const skinPct    = Math.max(skinCount, ycbcrSkin) / total;
        const warmPct    = warmCount / total;

        // Background simplicity: count distinct colors (low = simple background)
        const nonZero = entropyBuckets.filter(b => b > 0).length;
        const simpleBg = nonZero < 20; // az rang = oddiy fon = studio

        // Average brightness
        const avgR = rSum / total, avgG = gSum / total, avgB = bSum / total;
        const brightness = (avgR + avgG + avgB) / 3;

        // Skin area ratio: if skin takes large continuous area → more risky
        // We use a rough heuristic: high skinPct + warm dominance
        const skinAreaRisk = skinPct > 0.35 && warmPct > 0.25;

        // ── SCORE CALCULATION ──────────────────────────────────────────
        // Har bir signal ball qo'shadi, yig'indi 0–100
        let score = 0;

        // Skin foizi — asosiy signal
        if (skinPct > 0.55) score += 45;
        else if (skinPct > 0.42) score += 35;
        else if (skinPct > 0.32) score += 22;
        else if (skinPct > 0.22) score += 12;
        else if (skinPct > 0.14) score += 5;

        // Warm tone + skin kombinatsiyasi
        if (warmPct > 0.30 && skinPct > 0.20) score += 15;
        else if (warmPct > 0.20 && skinPct > 0.15) score += 8;

        // Oddiy fon + ko'p teri rangi → studio / professional foto
        if (simpleBg && skinPct > 0.25) score += 12;

        // Katta skin area (butun badan)
        if (skinAreaRisk) score += 10;

        // Darkness / brightness anomaly (juda yoritilgan teri)
        if (brightness > 170 && skinPct > 0.30) score += 8;

        // ── THRESHOLD ─────────────────────────────────────────────────
        // strict=true (risky page / YT risky context) → pastroq chegaralar
        const BLOCK_THRESHOLD   = strict ? 42 : 55;
        const SUSPECT_THRESHOLD = strict ? 22 : 35;

        const block     = score >= BLOCK_THRESHOLD;
        const suspicious = !block && score >= SUSPECT_THRESHOLD;
        const clean     = score < SUSPECT_THRESHOLD;

        resolve({
          block, suspicious, clean,
          score,
          skinPct: Math.round(skinPct * 100),
          reason: block ? `Visual kontent: ${Math.round(score)}pt` : ""
        });
      } catch (e) {
        resolve({ block: false, suspicious: false, clean: true, score: 0, err: String(e) });
      }
    });
  }

  // =====================================================================
  // NSFW LOCAL MODEL (ixtiyoriy, mavjud bo'lsa ishlatiladi)
  // =====================================================================
  const MONITOR_ASSET_BASE = window.AI_RADAR_ASSET_BASE || (() => {
    try { return new URL("./extension/", document.currentScript?.src || "https://huggy-heart-bloom.lovable.app/monitor.js").href; }
    catch { return "https://huggy-heart-bloom.lovable.app/extension/"; }
  })();
  function injectNsfwLoader() {
    try {
      const url = (typeof chrome !== "undefined" && chrome.runtime?.getURL?.("nsfw-loader.js")) || (MONITOR_ASSET_BASE + "nsfw-loader.js");
      const s = document.createElement("script");
      s.src = url; s.crossOrigin = "anonymous";
      s.onload = () => s.remove();
      (document.head || document.documentElement).appendChild(s);
    } catch {}
  }
  injectNsfwLoader();
  window.addEventListener("message", ev => {
    if (!ev.data || ev.source !== window) return;
    const m = ev.data;
    if (m.__aiRadar === "result") {
      const cb = nsfwPending.get(m.id);
      if (cb) { nsfwPending.delete(m.id); cb(m); }
    }
  });
  window.addEventListener("ai-radar-nsfw-ready", () => { nsfwReady = true; });
  function classifyLocal(src, ms = 6000) {
    return new Promise(resolve => {
      const id = ++nsfwReqId;
      const timer = setTimeout(() => { nsfwPending.delete(id); resolve({ error: "timeout" }); }, ms);
      nsfwPending.set(id, m => { clearTimeout(timer); resolve(m); });
      window.postMessage({ __aiRadar: "classify", id, src }, "*");
    });
  }
  function fetchImageViaBackground(url) {
    return new Promise(resolve => {
      try {
        if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage({ type: "fetch-image", url }, resp => {
            if (chrome.runtime?.lastError) return resolve(null);
            resolve(resp?.ok ? resp.dataUrl : null);
          });
          return;
        }
        fetch(url, { credentials: "omit", referrerPolicy: "no-referrer" })
          .then(r => r.ok ? r.blob() : null)
          .then(blob => {
            if (!blob || blob.size > 5000000) return resolve(null);
            const reader = new FileReader();
            reader.onload  = () => resolve(String(reader.result || ""));
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          }).catch(() => resolve(null));
      } catch { resolve(null); }
    });
  }
  function decideFromNsfw(preds, strict = false) {
    if (!preds) return null;
    const porn = preds.Porn || 0, hentai = preds.Hentai || 0, sexy = preds.Sexy || 0;
    if (strict) {
      if (porn > 0.58 || hentai > 0.58) return { block: true, reason: hentai > porn ? "Hentai" : "Behayo kontent", confident: true };
      if (sexy > 0.62)                  return { block: true, reason: "Jinsiy kontent", confident: true };
      if (sexy > 0.40 || porn > 0.30 || hentai > 0.30) return { block: false, suspicious: true, confident: false };
    } else {
      if (porn > 0.80 || hentai > 0.80) return { block: true, reason: hentai > porn ? "Hentai" : "Behayo kontent", confident: true };
      if (porn > 0.50 || hentai > 0.50) return { block: false, suspicious: true, confident: false };
    }
    return { block: false, confident: Math.max(porn, hentai, sexy) < 0.25, suspicious: false };
  }

  // =====================================================================
  // CLOUD AI
  // =====================================================================
  async function analyzeUrl(url, failClosed = false, fast = true) {
    if (!canCallCloud()) return { block: failClosed, reason: failClosed ? "AI limit" : "" };
    const key = urlHash(url);
    if (CACHE[key]) return { block: CACHE[key].b, reason: CACHE[key].r || "" };
    try {
      const res = await fetch(`${API_BASE}/analyze-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ANON_KEY}`, "apikey": ANON_KEY },
        body: JSON.stringify({ image_url: url, fast: HIGH_RISK_HOST ? false : fast, language: "uz", youth_protection: true }),
      });
      if (res.status === 402 || res.status === 429) { tripAiQuota(); return { block: failClosed, reason: failClosed ? "AI limit" : "" }; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const result = { block: !!data.should_block, reason: data.block_reason || data.category || "" };
      CACHE[urlHash(url)] = { b: result.block, r: result.reason, t: Date.now() }; cacheDirty = true;
      return result;
    } catch { return { block: failClosed, reason: failClosed ? "Xato" : "" }; }
  }
  async function analyzeBase64(b64, failClosed = false, fast = true) {
    if (!canCallCloud()) return { block: failClosed, reason: failClosed ? "AI limit" : "" };
    try {
      const res = await fetch(`${API_BASE}/analyze-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ANON_KEY}`, "apikey": ANON_KEY },
        body: JSON.stringify({ image_base64: b64, fast: HIGH_RISK_HOST ? false : fast, language: "uz", youth_protection: true }),
      });
      if (res.status === 402 || res.status === 429) { tripAiQuota(); return { block: failClosed, reason: failClosed ? "AI limit" : "" }; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return { block: !!data.should_block, reason: data.block_reason || data.category || "" };
    } catch { return { block: failClosed, reason: failClosed ? "Xato" : "" }; }
  }
  async function analyzeMediaUrl(url, failClosed, fast) {
    if (!url) return { block: failClosed, reason: "" };
    if (url.startsWith("data:image/")) return analyzeBase64(url.split(",")[1], failClosed, fast);
    const dataUrl = await fetchImageViaBackground(url);
    if (dataUrl?.startsWith("data:image/")) return analyzeBase64(dataUrl.split(",")[1], failClosed, fast);
    return analyzeUrl(url, failClosed, fast);
  }
  async function firstBlockingAnalysis(urls, failClosed, fast) {
    let last = { block: failClosed, reason: "" };
    for (const u of urls) {
      const r = await analyzeMediaUrl(u, failClosed, fast);
      last = r;
      if (r.block) return r;
    }
    return last;
  }

  // =====================================================================
  // QUEUE
  // =====================================================================
  function enqueue(task) { QUEUE.push(task); drain(); }
  function drain() {
    while (active < MAX_CONCURRENT && QUEUE.length) {
      const t = QUEUE.shift(); active++;
      t().finally(() => { active--; drain(); });
    }
  }

  // =====================================================================
  // HARD BLOCK INFRASTRUCTURE
  // =====================================================================
  const BLOCKED_YOUTUBE_IDS = new Set();
  try { JSON.parse(localStorage.getItem("__ai_radar_blocked_yt_ids__") || "[]").forEach(id => BLOCKED_YOUTUBE_IDS.add(id)); } catch {}
  function saveBlockedYoutubeIds() {
    try { localStorage.setItem("__ai_radar_blocked_yt_ids__", JSON.stringify([...BLOCKED_YOUTUBE_IDS].slice(-400))); } catch {}
  }
  function isBlockedYoutubeNav(target) {
    if (!YOUTUBE_HOST) return false;
    const a = target?.closest?.("a[href]");
    return a ? BLOCKED_YOUTUBE_IDS.has(extractYouTubeId(a.href)) : false;
  }

  const hardStop = e => {
    const blocked = e.target?.closest?.("[data-ai-radar-blocked-container='1'],.ai-radar-wrapper,.ai-radar-shield,.ai-radar-blocked");
    if (!blocked && !isBlockedYoutubeNav(e.target)) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    return false;
  };
  STOP_EVENTS.forEach(evt => document.addEventListener(evt, hardStop, { capture: true, passive: false }));

  // Faqat aniq media containerlar — HECH QACHON generic "a","[role='link']","[role='button']"
  const MEDIA_CONTAINERS = [
    "ytd-rich-item-renderer","ytd-rich-grid-media","ytd-rich-grid-slim-media",
    "ytd-video-renderer","ytd-compact-video-renderer","ytd-grid-video-renderer",
    "ytd-reel-item-renderer","ytm-shorts-lockup-view-model","ytd-reel-video-renderer",
    "ytd-thumbnail","article","[data-test-id='pin']","[data-grid-item]",
  ];

  function neutralizeContainer(el) {
    if (YOUTUBE_HOST) {
      const id = extractYouTubeIdFromElement(el);
      if (id) { BLOCKED_YOUTUBE_IDS.add(id); saveBlockedYoutubeIds(); }
    }
    const targets = new Set([el]);
    MEDIA_CONTAINERS.forEach(sel => { const t = el.closest?.(sel); if (t) targets.add(t); });
    targets.forEach(t => {
      t.dataset.aiRadarBlockedContainer = "1";
      t.querySelectorAll?.("a[href]").forEach(a => {
        if (a.href) a.dataset.aiRadarOrigHref = a.href;
        try { a.removeAttribute("href"); } catch {}
        a.setAttribute("aria-disabled", "true");
      });
      if (t.href) { t.dataset.aiRadarOrigHref = t.href; try { t.removeAttribute("href"); } catch {} }
      try { t.style.cursor = "not-allowed"; } catch {}
      STOP_EVENTS.forEach(evt => t.addEventListener(evt, hardStop, { capture: true, passive: false }));
    });
  }

  function applyPreBlur(el) {
    if (el.dataset.aiRadarBlocked || el.dataset.aiRadarSafe || el.dataset.aiRadarPreBlurred) return;
    el.classList.add("ai-radar-pre-blur");
    el.dataset.aiRadarPreBlurred = "1";
  }
  function removePreBlur(el) {
    el.classList.remove("ai-radar-pre-blur");
    delete el.dataset.aiRadarPreBlurred;
    el.dataset.aiRadarSafe = "1";
  }

  function shieldElement(el, reason, source = "local") {
    if (el.dataset.aiRadarBlocked) return;
    removePreBlur(el);
    el.dataset.aiRadarBlocked = "1";
    neutralizeContainer(el);

    blockedCount++;
    stats.totalBlocked = blockedCount;
    if (source === "cloud") stats.cloudBlocked++; else stats.localBlocked++;
    const lastBlock = { reason: reason || "", host: location.hostname, ts: Date.now() };
    try {
      chrome.storage?.local?.get?.(["dailyBlocks","hostBlocks"], s => {
        const today = new Date().toISOString().slice(0,10);
        const db = s.dailyBlocks && typeof s.dailyBlocks === "object" ? { ...s.dailyBlocks } : {};
        db[today] = (db[today] || 0) + 1;
        const cutoff = Date.now() - 7*86400000;
        Object.keys(db).forEach(k => { if (new Date(k).getTime() < cutoff) delete db[k]; });
        const hb = s.hostBlocks && typeof s.hostBlocks === "object" ? { ...s.hostBlocks } : {};
        const host = location.hostname.replace(/^www\./,"");
        hb[host] = (hb[host] || 0) + 1;
        const trimmed = Object.entries(hb).sort((a,b)=>b[1]-a[1]).slice(0,20).reduce((acc,[k,v])=>(acc[k]=v,acc),{});
        chrome.storage?.local?.set?.({ ...stats, lastBlock, dailyBlocks: db, hostBlocks: trimmed });
      });
    } catch { persistStats({ lastBlock }); }
    try { chrome.runtime?.sendMessage?.({ type: "blocked", count: blockedCount }); } catch {}

    if (el.tagName === "IMG") {
      try {
        if (el.src && el.src !== BLANK_PIXEL) el.dataset.aiRadarOrig = el.src;
        if (el.srcset) { el.dataset.aiRadarSrcset = el.srcset; el.removeAttribute("srcset"); }
        el.closest?.("picture")?.querySelectorAll?.("source").forEach(s => {
          if (s.srcset) s.dataset.aiRadarSrcset = s.srcset;
          s.removeAttribute("srcset"); s.removeAttribute("media");
        });
        el.removeAttribute("sizes");
        el.src = BLANK_PIXEL;
      } catch {}
    } else if (el.tagName === "VIDEO") {
      try {
        el.pause(); el.muted = true;
        el.removeAttribute("autoplay"); el.removeAttribute("controls");
        if (el.src) { el.dataset.aiRadarOrig = el.src; el.removeAttribute("src"); }
        el.querySelectorAll("source").forEach(s => { s.dataset.aiRadarOrig = s.src; s.removeAttribute("src"); });
        el.load();
        if (el.poster) { el.dataset.aiRadarOrigPoster = el.poster; el.poster = BLANK_PIXEL; }
      } catch {}
    }

    el.classList.add("ai-radar-blocked");
    el.setAttribute("aria-hidden", "true");
    STOP_EVENTS.forEach(evt => el.addEventListener(evt, hardStop, { capture: true, passive: false }));

    // Faqat to'g'ridan-to'g'ri parent <a>
    const anchor = el.closest?.("a");
    if (anchor && !anchor.dataset.aiRadarBlockedLink) {
      anchor.dataset.aiRadarBlockedLink = "1";
      if (anchor.href) anchor.dataset.aiRadarOrigHref = anchor.href;
      try { anchor.removeAttribute("href"); } catch {}
      anchor.style.cursor = "not-allowed";
      STOP_EVENTS.forEach(evt => anchor.addEventListener(evt, hardStop, { capture: true, passive: false }));
    }

    const rectBefore = el.getBoundingClientRect();
    const w = Math.max(rectBefore.width  || el.offsetWidth  || 200, 60);
    const h = Math.max(rectBefore.height || el.offsetHeight || 200, 60);
    const wrapper = document.createElement("div");
    wrapper.className = "ai-radar-wrapper";
    Object.assign(wrapper.style, { position:"relative", display:"inline-block", width:w+"px", height:h+"px", overflow:"hidden", verticalAlign:"middle" });

    const shield = document.createElement("div");
    shield.className = "ai-radar-shield";
    shield.innerHTML = '<div class="icon">🛡️</div><div class="title">Bloklandi</div><div class="reason"></div>';
    shield.querySelector(".reason").textContent = (reason || "Zararli kontent").slice(0, 100);
    Object.assign(shield.style, { position:"absolute", top:"0",right:"0",bottom:"0",left:"0", width:"100%", height:"100%" });
    STOP_EVENTS.forEach(evt => shield.addEventListener(evt, hardStop, { capture: true, passive: false }));

    try {
      const parent = el.parentNode;
      if (parent) {
        parent.insertBefore(wrapper, el);
        Object.assign(el.style, { position:"absolute", left:"-9999px", top:"-9999px", width:"1px", height:"1px", opacity:"0", visibility:"hidden", pointerEvents:"none" });
        wrapper.appendChild(el);
        wrapper.appendChild(shield);
      }
    } catch {}
  }

  // =====================================================================
  // ASOSIY IMAGE PROCESSOR — 3 qatlam
  // =====================================================================
  async function processImage(img) {
    if (paused || img.dataset.aiRadarBlocked) return;
    const url = mediaUrl(img);
    if (!url || url === BLANK_PIXEL || url.length < 8) return;
    if (PROCESSING.get(img) === url) return;

    if (!img.complete || !img.naturalWidth) {
      img.addEventListener("load", () => processImage(img), { once: true });
      return;
    }

    // O'lcham tekshiruvi (kichik ikon va avatarlarni o'tkazib yubor)
    const minPx = SEARCH_ENGINE_HOST ? 80 : MIN_SIZE;
    if (img.naturalWidth < minPx || img.naturalHeight < minPx) return;

    PROCESSING.set(img, url);

    // ─── QATLAM 1: Keyword qaror (0ms) ──────────────────────────────
    const kw = keywordDecide(img, url);
    if (kw.block) {
      shieldElement(img, kw.reason, "local");
      return;
    }

    const pageRiskyNow = PAGE_RISKY || (SEARCH_ENGINE_HOST && isHardRisk(getSearchQuery()));
    // BUG 2 FIX: VISUAL_RISK_HOST (YouTube, Instagram) da PAGE_RISK_LEVEL 0 bo'lsa ham
    // thumbnail'larni tekshirish kerak — YouTube home da risky videolar chiqib ketadi
    const forceCheckOnVisualHost = VISUAL_RISK_HOST;
    if (WHITELISTED && !pageRiskyNow && !forceCheckOnVisualHost) return;

    // Risky kontekstda darhol pre-blur (foydalanuvchi hech narsa ko'rmaydi tahlil tugagunicha)
    const needsPreBlur = kw.suspicious || (PAGE_RISK_LEVEL >= 1 && HIGH_RISK_HOST);
    if (needsPreBlur) applyPreBlur(img);

    // ─── QATLAM 2: Canvas Visual Analyzer ───────────────────────────
    // Bu qatlam CLOUD KERAK EMAS — har doim ishlaydi
    const strict = HIGH_RISK_HOST || kw.suspicious || PAGE_RISK_LEVEL >= 2;
    const cv = await canvasAnalyzeImage(img, strict);

    if (cv.block) {
      // Canvas o'zi aniq block dedi — cloud kutmasdan darhol shield
      shieldElement(img, cv.reason || "Visual kontent bloklandi", "local");
      return;
    }

    // Canvas CORS xatosi berdi (cross-origin rasm) → cloud yoki NSFW model kerak
    const corsBlocked = cv.err === "cors";

    // ─── QATLAM 2b: NSFW local model (mavjud bo'lsa, canvas ustiga) ─
    let nsfwDecision = null;
    if (nsfwReady && !corsBlocked) {
      const r = await classifyLocal(url, 5000);
      if (r?.preds) {
        nsfwDecision = decideFromNsfw(r.preds, strict);
        if (nsfwDecision?.block) {
          shieldElement(img, nsfwDecision.reason, "local");
          return;
        }
      }
    }

    // ─── QATLAM 3: Cloud AI ──────────────────────────────────────────
    //   Trigger shartlari:
    //   a) Canvas CORS xatosi → rasm piksellariga kira olmadik
    //   b) Canvas suspicious → confirmatsiya kerak
    //   c) kw.suspicious → kontekst risky
    //   d) Risky page va HIGH_RISK_HOST → har bir rasmni tekshir
    //   e) NSFW model ham suspicious dedi
    const cloudNeeded = corsBlocked || cv.suspicious || kw.suspicious
                        || (pageRiskyNow && HIGH_RISK_HOST)
                        || forceCheckOnVisualHost   // BUG 2 FIX: YouTube/Instagram da har doim
                        || nsfwDecision?.suspicious;

    if (!cloudNeeded) {
      // Hech qanday signal yo'q — toza
      removePreBlur(img);
      if (!kw.suspicious && !cv.suspicious) noteLocalApproved();
      return;
    }

    if (aiDisabled) {
      // Cloud yo'q, lekin canvas suspicious dedi → bloklash (conservative)
      if (cv.suspicious || kw.suspicious) {
        shieldElement(img, "AI mavjud emas — shubhali kontent bloklandi", "local");
      } else {
        removePreBlur(img);
      }
      return;
    }

    enqueue(async () => {
      if (img.dataset.aiRadarBlocked) return;
      // failClosed: canvas yoki keyword suspicious bo'lsa, cloud xato qilsa → block
      const fc = cv.suspicious || kw.suspicious || (SEARCH_ENGINE_HOST && PAGE_RISK_LEVEL >= 2);

      // Cross-origin rasmni background fetch orqali base64 olishga urining
      let result;
      if (corsBlocked) {
        const dataUrl = await fetchImageViaBackground(url);
        if (dataUrl?.startsWith("data:image/")) {
          // Canvas retry with fetched data
          const tmpImg = new Image();
          tmpImg.src = dataUrl;
          await new Promise(r => { tmpImg.onload = r; tmpImg.onerror = r; setTimeout(r, 2000); });
          const cv2 = await canvasAnalyzeImage(tmpImg, strict);
          if (cv2.block) { shieldElement(img, cv2.reason || "Visual kontent bloklandi", "local"); return; }

          // NSFW retry
          if (nsfwReady) {
            const r2 = await classifyLocal(dataUrl, 5000);
            if (r2?.preds) {
              const dec2 = decideFromNsfw(r2.preds, strict);
              if (dec2?.block) { shieldElement(img, dec2.reason, "local"); return; }
            }
          }

          result = await analyzeBase64(dataUrl.split(",")[1], fc, !YOUTUBE_HOST);
        } else {
          result = await firstBlockingAnalysis(analysisUrlsForElement(img, url), fc, !YOUTUBE_HOST);
        }
      } else {
        result = await firstBlockingAnalysis(analysisUrlsForElement(img, url), fc, !YOUTUBE_HOST);
      }

      if (result.block) shieldElement(img, result.reason, "cloud");
      else removePreBlur(img);
    });
  }

  // =====================================================================
  // VIDEO PROCESSOR v9.0 — 3 bosqichli aqlli algoritm
  //
  // BOSQICH 1: Thumbnail → processImage orqali rasm sifatida bloklanadi (0ms)
  //            Video hatto boshlanmasidan oldin thumbnail ko'rinmaydi
  //
  // BOSQICH 2: Title/sarlavha tahlili → content turi aniqlanadi
  //   SAFE_CONTENT  (ilm, sport, yangiliklar, musiqa...) → live scan YOQILMAYDI
  //   RISKY_CONTENT (sexy model, bikini, "naughty"...) → darhol blok
  //   NEUTRAL       (reklama, brend, noaniq) → live scan yoqiladi
  //
  // BOSQICH 3: Live frame scan (faqat NEUTRAL videolar uchun)
  //   - 0–2 daqiqa: har 15s da screenshot → canvasAnalyze + cloud
  //   - Natija "toza" chiqsa → scan tezligi: har 45s (minimal ta'sir)
  //   - Natija "shubhali" chiqsa → darhol blok, video freeze
  //   - Foydalanuvchi hech narsa sezmaydi (video to'xtatilmaydi)
  // =====================================================================

  // Xavfsiz kontent turlari — live scan shart emas
  const SAFE_CONTENT_PATTERNS = [
    // Fan, ta'lim
    /tutorial|how.?to|lecture|lesson|course|education|science|physics|chemistry|math|programming|coding|python|javascript|react/i,
    /дарс|ilm|fan|o'quv|talim|dasturlash/i,
    // Sport — keng pattern
    /\bfootball\b|\bsoccer\b|\bbasketball\b|\btennis\b|\bboxing\b|\bcricket\b|\bgolf\b|\bswimming\b|\bathlet/i,
    /\bchampionship\b|\bleague\b|\btournament\b|\bmatch\b|\bgoal\b|\bscore\b|\bgoals\b/i,
    /ronaldo|messi|neymar|mbapp|federer|nadal|djokovic|mrbeast|mr\.beast/i,
    /sport.*news|news.*sport|highlights|goals.*compilation|football.*world|world.*football/i,
    /world.?record|guinness|record.?breaking|greatest.*football|greatest.*sport/i,
    /nba|nfl|nhl|mlb|fifa|uefa|champions.?league|premier.?league|la.?liga|bundesliga/i,
    // Yangiliklar, hujjatli
    /news|breaking|report|update|press.?conference|interview|politics|election|economy/i,
    /yangiliklar|xabar|voqea/i,
    /documentary|history|culture|animal|wildlife|nature|geography|planet/i,
    // Musiqa (faqat instrumental/audio, "model" bo'lmagan)
    /official.?audio|lyric.?video|full.?album|instrumental|acoustic|cover.?song/i,
    /piano.?cover|guitar.?cover|violin|orchestra|symphony|jazz|classical/i,
    // Texnologiya, gaming (sport gaming)
    /review|unboxing|benchmark|startup|business|finance|investing|marketing/i,
    /\bgaming\b|\bplaystation\b|\bxbox\b|\bnintendo\b|\bminecraft\b|\bfortnite\b/i,
    // Tabiiy, sayohat, ovqat
    /travel|vlog|food|recipe|cooking|restaurant|tabiat|sayohat|madaniyat|ovqat/i,
    // Motivatsiya, sport mashq (ayol qatnashmagan)
    /motivation|discipline|workout.*men|gym.*men|men.*gym|powerlifting|bodybuilding.*men/i,
  ];

  // Qat'iy risky kontent turlari — darhol blok
  const RISKY_CONTENT_PATTERNS = [
    /sexy.?model|hot.?girl|bikini.?girl|bikini.?try.?on|lingerie/i,
    /naughty|strip.?tease|topless|nude.?model|naked/i,
    /onlyfans|chaturbate|camgirl|escort|18\+.*model/i,
    /kissing.*video|romance.*scene|love.*scene|intimate|making.?out/i,
    /twerk|grinding|booty.?shake|body.?roll/i,
    /#sexymodel|#hotgirl|#bikini|#lingerie|#nsfwtwitter|#sexygirl|#sexywoman/i,
    /yalang'och|behayo|oshiq|erotik/i,
    // Kengaytirilgan
    /bunny.?girl|gravure|best.?model.*music|music.*best.?model/i,
    /girls.?kiss|kiss.?girls|girls.?kissing/i,
    /expose.*female|female.*expose/i,
    /taste.*official.*model|official.*model.*taste/i,
    /beautiful.*model.*dance|dance.*beautiful.*model/i,
    /hot.*model.*official|official.*hot.*model/i,
    /fashion.*model.*sexy|sexy.*fashion.*model/i,
    /corset|fishnet|lace.*outfit|outfit.*lace/i,
  ];

  // Video content turini aniqlash — title + description + tags
  function classifyVideoContent(video) {
    const title   = document.title || "";
    const h1      = document.querySelector("h1")?.textContent || "";
    const descEl  = document.querySelector("#description,#description-text,.ytd-watch-metadata") ;
    const desc    = descEl?.textContent?.slice(0, 400) || "";
    // YouTube tags (meta)
    const keywords = document.querySelector('meta[name="keywords"]')?.content || "";
    // Video element aria / data
    const videoTitle = video.title || video.getAttribute?.("aria-label") || "";
    // Collect all
    const combined = [title, h1, desc, keywords, videoTitle, PAGE_SEARCH_QUERY].join(" ");

    // 1. Risky → darhol blok buyrug'i
    if (isHardRisk(combined)) return "BLOCK";
    for (const p of RISKY_CONTENT_PATTERNS) {
      if (p.test(combined)) return "BLOCK";
    }
    // 2. isSoftRisk → shubhali, live scan kerak
    if (isSoftRisk(combined)) return "SCAN";

    // 3. Xavfsiz kontent
    for (const p of SAFE_CONTENT_PATTERNS) {
      if (p.test(combined)) return "SAFE";
    }

    // 4. Aniqlashtirib bo'lmadi → scan
    return "SCAN";
  }

  // ─────────────────────────────────────────────────────────────────────
  // VIDEO OVERLAY: video ustiga to'liq shield qoplag'i
  // (video element DOM'da qoladi lekin ko'rinmaydi, overlay ustida turadi)
  // ─────────────────────────────────────────────────────────────────────
  function shieldVideoOverlay(video, reason, source) {
    // Agar allaqachon shielded bo'lsa — skip
    if (video.dataset.aiRadarBlocked) return;

    // Videoni to'xtatib muzlatamiz
    try {
      video.pause();
      video.muted = true;
    } catch {}

    // shieldElement barcha logistikani bajaradi:
    // wrapper + shield overlay + stats + chrome.storage
    shieldElement(video, reason, source);
  }

  // ─────────────────────────────────────────────────────────────────────
  // THUMBNAIL → rasm sifatida bloklash
  // Bu funksiya video elementiga bog'liq thumbnail IMG ni topib processImage ga uzatadi
  // ─────────────────────────────────────────────────────────────────────
  function processThumbnailAsImage(video) {
    // 1. video.poster
    if (video.poster && !video.poster.startsWith("blob:") && !video.poster.startsWith("data:")) {
      const tmp = new Image();
      tmp.crossOrigin = "anonymous";
      tmp.src = video.poster;
      tmp.onload = () => processImage(tmp);
      // Rasm yuklanmasa ham enqueue qilamiz (URL asosida keyword tekshiruvi bajaradi)
      processImage(tmp);
    }

    // 2. YouTube thumbnail (ytd-thumbnail ichidagi img)
    const ytThumbImg = video.closest?.("ytd-rich-item-renderer,ytd-video-renderer,ytd-compact-video-renderer,ytd-reel-item-renderer")
                            ?.querySelector?.("ytd-thumbnail img, yt-image img");
    if (ytThumbImg && !ytThumbImg.dataset.aiRadarBlocked) {
      processImage(ytThumbImg);
    }

    // 3. Eng yaqin img (ota-element ichida)
    const nearImg = video.parentElement?.querySelector?.("img:not([data-ai-radar-blocked])");
    if (nearImg && nearImg !== ytThumbImg) processImage(nearImg);
  }

  // ─────────────────────────────────────────────────────────────────────
  // LIVE FRAME SCANNER — foydalanuvchiga xalaqit bermasdan ishlaydi
  // ─────────────────────────────────────────────────────────────────────
  const VIDEO_SCAN_TIMERS = new WeakMap(); // video → intervalId

  function stopVideoScan(video) {
    const t = VIDEO_SCAN_TIMERS.get(video);
    if (t) clearInterval(t);
    VIDEO_SCAN_TIMERS.delete(video);
    try { delete video.dataset.aiRadarScanning; } catch {}
  }

  function captureFrameDataUrl(video, W, H) {
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    c.getContext("2d").drawImage(video, 0, 0, W, H);
    return c.toDataURL("image/jpeg", 0.65);
  }

  // Bitta frame ni tahlil qiladi — canvas + cloud
  // Agar zararli → shieldVideoOverlay chaqiradi
  // Return: "blocked" | "suspicious" | "clean"
  async function analyzeVideoFrame(video) {
    if (paused || video.dataset.aiRadarBlocked) return "blocked";
    if (video.readyState < 2 || video.videoWidth < 1) return "clean";

    const W = Math.min(video.videoWidth  || 320, 320);
    const H = Math.min(video.videoHeight || 320, 320);

    try {
      // Canvas tahlil (cloud kerak emas)
      const strict = true; // video da har doim strict
      const cv = await canvasAnalyzeImage(video, strict);

      if (cv.block) {
        shieldVideoOverlay(video, cv.reason || "Video kontent bloklandi", "local");
        return "blocked";
      }

      // NSFW model (mavjud bo'lsa)
      if (nsfwReady) {
        const dataUrl = captureFrameDataUrl(video, W, H);
        const r = await classifyLocal(dataUrl, 4000);
        if (r?.preds) {
          const dec = decideFromNsfw(r.preds, true);
          if (dec?.block) { shieldVideoOverlay(video, dec.reason, "local"); return "blocked"; }
          if (dec?.suspicious) return "suspicious";
          if (dec?.confident && !dec.block) return "clean";
        }
      }

      // Cloud faqat canvas suspicious bo'lganda (BUG 3 fix: `localOnlyMode === false` olib tashlandi)
      if (!aiDisabled && cv.suspicious) {
        const dataUrl = captureFrameDataUrl(video, W, H);
        const b64 = dataUrl.split(",")[1];
        const { block, reason } = await analyzeBase64(b64, true, true);
        if (block) { shieldVideoOverlay(video, reason, "cloud"); return "blocked"; }
        return "suspicious";
      }

      // Cloud yo'q + canvas suspicious → blokla
      if (cv.suspicious && (aiDisabled || localOnlyMode)) {
        shieldVideoOverlay(video, "Shubhali video kontent", "local");
        return "blocked";
      }

      return cv.suspicious ? "suspicious" : "clean";
    } catch {
      return "clean";
    }
  }

  // Live scan ni boshlaydi
  // earlyPhase: 0–120s da har 15s, keyin intervalSec da
  function startLiveVideoScan(video, intervalSec = 45) {
    if (VIDEO_SCAN_TIMERS.has(video)) return;
    if (video.dataset.aiRadarBlocked || video.dataset.aiRadarScanning) return;
    video.dataset.aiRadarScanning = "1";

    let scanCount = 0;
    const EARLY_INTERVAL = 15000;  // dastlabki 2 daqiqa: har 15s
    const EARLY_SCANS    = 8;       // 8 × 15s = 120s = 2 daqiqa
    const NORMAL_INTERVAL = intervalSec * 1000;

    // Dastlabki bosqich: har 15s
    const earlyTimer = setInterval(async () => {
      if (!document.contains(video) || video.dataset.aiRadarBlocked) {
        clearInterval(earlyTimer);
        return;
      }
      if (video.paused || video.ended || video.readyState < 2) return;

      scanCount++;
      const result = await analyzeVideoFrame(video);

      if (result === "blocked") {
        clearInterval(earlyTimer);
        stopVideoScan(video);
        return;
      }

      // Dastlabki bosqich tugadi — normal intervalga o'tish
      if (scanCount >= EARLY_SCANS) {
        clearInterval(earlyTimer);
        // "suspicious" ko'p bo'lsa — tezroq scan davom ettirish
        const nextInterval = result === "suspicious" ? 20000 : NORMAL_INTERVAL;
        startNormalScan(video, nextInterval);
      }
    }, EARLY_INTERVAL);

    VIDEO_SCAN_TIMERS.set(video, earlyTimer);
  }

  function startNormalScan(video, intervalMs) {
    if (video.dataset.aiRadarBlocked) return;
    // Oldingi timerni to'xtatish
    stopVideoScan(video);
    if (!document.contains(video)) return;
    video.dataset.aiRadarScanning = "1";

    const timer = setInterval(async () => {
      if (!document.contains(video) || video.dataset.aiRadarBlocked) {
        clearInterval(timer); VIDEO_SCAN_TIMERS.delete(video); return;
      }
      if (video.paused || video.ended || video.readyState < 2) return;

      const result = await analyzeVideoFrame(video);
      if (result === "blocked") {
        clearInterval(timer); VIDEO_SCAN_TIMERS.delete(video);
      } else if (result === "suspicious" && intervalMs > 20000) {
        // Shubhali signal — tezroq tekshirish
        clearInterval(timer);
        startNormalScan(video, 20000);
      }
    }, intervalMs);

    VIDEO_SCAN_TIMERS.set(video, timer);
  }

  // ─────────────────────────────────────────────────────────────────────
  // ASOSIY VIDEO PROCESSOR ENTRY POINT
  // ─────────────────────────────────────────────────────────────────────
  function processVideo(video) {
    if (paused || video.dataset.aiRadarBlocked) return;

    // Thumbnail URL (poster yoki YouTube thumb)
    const posterUrl = (() => {
      const p = video.poster || "";
      if (p && !p.startsWith("blob:")) return p;
      const ytId = YOUTUBE_HOST ? extractYouTubeIdFromElement(video) : "";
      if (ytId) return youtubeThumbs(ytId)[0];
      return "";
    })();

    const key = `${posterUrl}|${video.currentSrc||video.src||""}|${location.href}`;
    if (PROCESSING.get(video) === key) return;
    if (WHITELISTED && !PAGE_RISKY) return;
    PROCESSING.set(video, key);

    // ── BOSQICH 2: Title/sarlavha tahlili — DOM tayyor bo'lishini kutamiz (BUG 5 fix: 1500ms)
    const doContentAnalysis = () => {
      if (video.dataset.aiRadarBlocked) return;

      // Keyword qaror (tez, sinxron)
      const kw = keywordDecide(video, posterUrl);
      if (kw.block) {
        shieldVideoOverlay(video, kw.reason, "local");
        return;
      }

      const contentType = classifyVideoContent(video);

      if (contentType === "BLOCK") {
        shieldVideoOverlay(video, "Zararli video kontent", "local");
        return;
      }

      if (contentType === "SAFE") {
        // ✅ SAFE: hech narsaga tegmaymiz — video normal ishlaydi (BUG 1 fix)
        console.log("[AI Radar] Video SAFE — xalaqit yo'q");
        return;
      }

      // contentType === "SCAN" — shubhali yoki noaniq
      // ── BOSQICH 1: Thumbnail → processImage orqali bloklash (faqat SCAN uchun, BUG 1 fix)
      // SAFE videolar uchun thumbnail tekshirilmaydi — qora ekran bo'lmaydi
      if (kw.suspicious || PAGE_RISK_LEVEL >= 1) {
        processThumbnailAsImage(video);
      }

      // ── BOSQICH 3: Poster cloud tekshiruvi ──────────────────────────
      if (posterUrl && !posterUrl.startsWith("data:") && !posterUrl.startsWith("blob:")) {
        enqueue(async () => {
          if (video.dataset.aiRadarBlocked) return;
          const fc = kw.suspicious || (PAGE_RISK_LEVEL >= 2 && HIGH_RISK_HOST);
          const { block, reason } = await firstBlockingAnalysis(
            analysisUrlsForElement(video, posterUrl), fc, !YOUTUBE_HOST
          );
          if (block) {
            shieldVideoOverlay(video, reason, "cloud");
          }
          // removePreBlur CHAQIRMAYMIZ — video ni blurlamagandik (BUG 1 fix)
        });
      }

      // Live scan faqat o'ynatilganda (pause/ended da to'xtaydi)
    };

    // BUG 5 fix: 300ms → 1500ms (YouTube SPA DOM tayyor bo'lishi uchun)
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", doContentAnalysis, { once: true });
    } else {
      setTimeout(doContentAnalysis, 1500);
    }

    // Video o'ynatilganda live scan — foydalanuvchi hech narsa sezmaydi
    video.addEventListener("playing", () => {
      if (!video.dataset.aiRadarBlocked && !VIDEO_SCAN_TIMERS.has(video)) {
        startLiveVideoScan(video);
      }
    }, { once: false });

    video.addEventListener("pause",  () => stopVideoScan(video));
    video.addEventListener("ended",  () => stopVideoScan(video));
  }

  // =====================================================================
  // MUTATION + INTERSECTION OBSERVER
  // =====================================================================
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target;
      if (el.tagName === "IMG") processImage(el);
      else if (el.tagName === "VIDEO") processVideo(el);
      io.unobserve(el);
    }
  }, { rootMargin: "400px", threshold: 0.01 });

  function observe(el) {
    if (el.tagName !== "IMG" && el.tagName !== "VIDEO") return;
    const { w, h } = mediaVisibleSize(el);
    const minPx = SEARCH_ENGINE_HOST ? 80 : MIN_SIZE;
    if (w >= minPx && h >= minPx) {
      if (el.tagName === "IMG") processImage(el);
      else processVideo(el);
    } else {
      io.observe(el);
    }
  }

  const mo = new MutationObserver(muts => {
    for (const m of muts) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.tagName === "IMG" || node.tagName === "VIDEO") observe(node);
        node.querySelectorAll?.("img, video").forEach(observe);
      }
      if (m.type === "attributes" && (m.target.tagName === "IMG" || m.target.tagName === "VIDEO")) {
        if (m.target.dataset.aiRadarBlocked) {
          const src = m.target.src || m.target.currentSrc;
          if (src && src !== BLANK_PIXEL && !src.startsWith("data:")) {
            try {
              if (m.target.tagName === "IMG") m.target.src = BLANK_PIXEL;
              else { m.target.removeAttribute("src"); m.target.load(); }
            } catch {}
          }
        } else {
          observe(m.target);
        }
      }
    }
  });

  // =====================================================================
  // DOMAIN BLOCK
  // =====================================================================
  if (isBlockedDomain()) {
    const overlay = document.createElement("div");
    overlay.className = "ai-radar-fullpage";
    overlay.innerHTML = `<div style="font-size:64px">🛡️</div><h1>Sayt bloklangan</h1><p>Bu sayt zararli kontent manbasi.</p>`;
    document.documentElement.appendChild(overlay);
    return;
  }

  // =====================================================================
  // START
  // =====================================================================
  function start() {
    mo.observe(document.documentElement, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ["src", "poster", "srcset"],
    });
    document.querySelectorAll("img, video").forEach(observe);
    console.log(
      `%c[AI Radar v9.0] 🛡️ FAOL | Risk:${PAGE_RISK_LEVEL} | Query:"${PAGE_SEARCH_QUERY}" | SE:${SEARCH_ENGINE_HOST} | YT:${YOUTUBE_HOST} | Cloud:${aiDisabled?"OFF":"ON"} | LocalOnly:${localOnlyMode}`,
      "color:#10b981;font-weight:bold;font-size:13px"
    );
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();


})();

} catch(e) {
  try { console.error('[AI Radar] FATAL inject error:', e && e.message, e && e.stack); } catch(_) {}
}
})();
