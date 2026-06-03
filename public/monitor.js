/**
 * AI Radar — Monitor Script v6
 * 3 qatlamli himoya:
 *   1. Whitelist/Blacklist (0ms, lokal)
 *   2. Lokal heuristics: skin-tone + URL/keyword (lokal, tekin)
 *   3. Cloud AI (faqat shubhali, kvota-cheklangan)
 */
(function () {
  "use strict";
  if (window.__AI_RADAR_LOADED__) return;
  window.__AI_RADAR_LOADED__ = true;


  function injectCoreStyles() {
    if (document.getElementById("ai-radar-core-style")) return;
    const css = document.createElement("style");
    css.id = "ai-radar-core-style";
    css.textContent = `
.ai-radar-blocked{pointer-events:none!important;user-select:none!important}.safe-blur{filter:blur(20px)!important;transition:filter .3s ease-in-out!important;cursor:pointer!important}.safe-blur.safe-blur-revealed{filter:none!important}.ai-radar-wrapper{position:relative!important;display:inline-block!important;vertical-align:middle;background:#0a0f1c;border-radius:6px;overflow:hidden}.ai-radar-shield{position:absolute!important;inset:0!important;background:rgba(10,15,28,.98);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;text-align:center;padding:10px;z-index:2147483647;border:2px solid #ef4444;border-radius:6px;box-shadow:0 0 0 1px rgba(239,68,68,.4),0 0 20px rgba(239,68,68,.3);pointer-events:auto!important;cursor:not-allowed!important;user-select:none;overflow:hidden}.ai-radar-shield .icon{font-size:26px;margin-bottom:4px}.ai-radar-shield .title{font-weight:700;color:#fca5a5;margin-bottom:4px;text-transform:uppercase;letter-spacing:1px}.ai-radar-shield .reason{opacity:.85;font-size:10px;max-width:90%;line-height:1.3}.ai-radar-preblocked-container{pointer-events:auto!important;user-select:auto!important}.ai-radar-youtube-hidden-card{display:revert!important;visibility:visible!important;pointer-events:auto!important}.ai-radar-pre-shield{position:absolute!important;inset:0!important;z-index:2147483646!important;display:flex!important;align-items:center!important;justify-content:center!important;min-height:40px;background:transparent!important;color:rgba(103,232,249,.55)!important;border:1px dashed rgba(103,232,249,.25)!important;font-family:ui-monospace,SFMono-Regular,Menlo,monospace!important;font-size:10px!important;text-align:center!important;pointer-events:none!important;cursor:default!important;opacity:.5}.ai-radar-pre-shield--active{background:rgba(10,15,28,.96)!important;color:#fca5a5!important;border:2px solid #ef4444!important;pointer-events:auto!important;cursor:not-allowed!important;opacity:1!important}.ai-radar-pre-shield--compact{inset:8px!important;min-height:32px!important;border-radius:6px!important;background:transparent!important}.ai-radar-scanning{outline:2px dashed rgba(34,211,238,.6)!important;outline-offset:-2px!important}`;
    (document.head || document.documentElement).appendChild(css);
  }
  injectCoreStyles();

  const API_BASE = "https://czxxfudupcikdomidbjl.supabase.co/functions/v1";
  const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6eHhmdWR1cGNpa2RvbWlkYmpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNzY2MDMsImV4cCI6MjA5NTY1MjYwM30.gWbO-U6srz-WC1DLUGkGGOpe2iB8kSCgpPgXJ3lrveo";

  const MIN_SIZE = 150; // ikon va avatarlarni o'tkazib yubor
  const MAX_CONCURRENT = 8;
  // v10: YouTube card-level hard block + stricter video fail-closed cache.
  const CACHE_KEY = "__ai_radar_cache_v10__";
  const PROCESSING = new WeakMap(); // element -> oxirgi tekshirilgan media kaliti
  const QUEUE = [];
  let active = 0;
  let blockedCount = 0;
  let aiDisabled = false;
  let paused = false;

  // Persisted stats (chrome.storage.local)
  const stats = { totalBlocked: 0, localBlocked: 0, cloudBlocked: 0, localApproved: 0 };
  try {
    chrome.storage?.local?.get?.(["totalBlocked","localBlocked","cloudBlocked","localApproved","paused"], (s) => {
      if (!s) return;
      stats.totalBlocked = s.totalBlocked || 0;
      stats.localBlocked = s.localBlocked || 0;
      stats.cloudBlocked = s.cloudBlocked || 0;
      stats.localApproved = s.localApproved || 0;
      paused = !!s.paused;
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

  // ========== NSFW LOKAL MODEL (page-context'ga inject) ==========
  let nsfwReady = false;
  let nsfwReqId = 0;
  const nsfwPending = new Map();
  const MONITOR_ASSET_BASE = window.AI_RADAR_ASSET_BASE || "https://ai-lens-saga.lovable.app/extension/";
  function injectNsfwLoader() {
    try {
      const url = (typeof chrome !== "undefined" && chrome.runtime?.getURL?.("nsfw-loader.js")) || (MONITOR_ASSET_BASE + "nsfw-loader.js");
      const s = document.createElement("script");
      s.src = url;
      s.crossOrigin = "anonymous";
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
  function classifyLocal(src, timeoutMs = 7000) {
    return new Promise((resolve) => {
      const id = ++nsfwReqId;
      const timer = setTimeout(() => { nsfwPending.delete(id); resolve({ error: "timeout" }); }, timeoutMs);
      nsfwPending.set(id, (m) => { clearTimeout(timer); resolve(m); });
      window.postMessage({ __aiRadar: "classify", id, src }, "*");
    });
  }
  function fetchImageViaBackground(url) {
    return new Promise((resolve) => {
      try {
        if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage({ type: "fetch-image", url }, (resp) => {
            if (chrome.runtime?.lastError) return resolve(null);
            if (resp?.ok) resolve(resp.dataUrl); else resolve(null);
          });
          return;
        }
        fetch(url, { credentials: "omit", referrerPolicy: "no-referrer" })
          .then((res) => res.ok ? res.blob() : null)
          .then((blob) => {
            if (!blob || blob.size > 5_000_000) return resolve(null);
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          })
          .catch(() => resolve(null));
      } catch { resolve(null); }
    });
  }
  // Avval to'g'ridan-to'g'ri, bo'lmasa background fetch (CORS bypass)
  async function classifyRobust(url, timeoutMs = 7000) {
    let r = await classifyLocal(url, timeoutMs);
    if (r && r.preds) return r;
    if (!url.startsWith("data:")) {
      const dataUrl = await fetchImageViaBackground(url);
      if (dataUrl) {
        r = await classifyLocal(dataUrl, timeoutMs);
        if (r && r.preds) return { ...r, dataUrl };
      }
    }
    return r;
  }
  function hostMatches(domains) {
    const host = location.hostname.toLowerCase().replace(/^www\./, "");
    return domains.some((d) => host === d || host.endsWith("." + d));
  }
  // VISUAL_RISK_DOMAINS — preShield endi click-through (pointer-events:none) va shaffof bo'lgani uchun
  // YouTube ham xavfsiz tarzda qo'shilgan. Faqat haqiqiy block bo'lganda ai-radar-shield faollashadi.
  const VISUAL_RISK_DOMAINS = [
    "instagram.com", "pinterest.com", "tiktok.com", "youtube.com", "youtu.be",
    "x.com", "twitter.com", "reddit.com", "threads.net", "snapchat.com",
  ];
  const VISUAL_RISK_HOST = hostMatches(VISUAL_RISK_DOMAINS);
  const YOUTUBE_HOST = hostMatches(["youtube.com", "youtu.be"]);
  const YOUTUBE_AGGRESSIVE_MODE = false;
  const VIDEO_SCAN_TIMERS = new WeakMap();
  const BLOCKED_YOUTUBE_IDS = new Set();
  try { JSON.parse(localStorage.getItem("__ai_radar_blocked_yt_ids__") || "[]").forEach((id) => BLOCKED_YOUTUBE_IDS.add(id)); } catch {}

  function installVisualRiskPrehide() {
    // Partner Mode: never blur/hide the whole feed before analysis.
    return;
  }
  installVisualRiskPrehide();

  // v5: zararli kontent o'tib ketmasligi uchun NSFW threshold'lar yanada qat'iy.
  function decideFromNsfw(preds, _strict = false) {
    if (!preds) return null;
    const porn = preds.Porn || 0;
    const hentai = preds.Hentai || 0;
    const score = Math.max(porn, hentai);
    if (score > 0.85) {
      return { block: true, reason: hentai > porn ? "Hentai" : "Behayo kontent", confident: true, score };
    }
    return { block: false, confident: true, score };
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
    "khanacademy.org","coursera.org","edx.org","udemy.com",
    "mit.edu","stanford.edu","harvard.edu","mdn.mozilla.org","developer.mozilla.org",
    "npmjs.com","nodejs.org","python.org","reactjs.org","react.dev","vuejs.org",
    "openai.com","anthropic.com","huggingface.co","kaggle.com","arxiv.org",
    "nytimes.com","bbc.com","bbc.co.uk","reuters.com","apnews.com","bloomberg.com",
    "amazon.com","ebay.com","aliexpress.com","etsy.com",
    "linkedin.com","medium.com","substack.com",
    "supabase.com","vercel.com","netlify.com","cloudflare.com","aws.amazon.com",
  ];
  // Foydalanuvchi qo'shgan whitelist (popup'dan)
  let USER_WHITELIST = [];
  try {
    chrome.storage?.local?.get?.(["userWhitelist"], (s) => {
      if (Array.isArray(s?.userWhitelist)) USER_WHITELIST = s.userWhitelist;
    });
    chrome.storage?.onChanged?.addListener?.((c, area) => {
      if (area === "local" && c.userWhitelist) {
        USER_WHITELIST = Array.isArray(c.userWhitelist.newValue) ? c.userWhitelist.newValue : [];
      }
    });
  } catch {}

  function isWhitelisted() {
    const host = location.hostname.toLowerCase();
    const user = USER_WHITELIST.map((d) => String(d).toLowerCase());
    if (user.some((d) => host === d || host.endsWith("." + d))) return true;
    if (VISUAL_RISK_HOST) return false;
    return WHITELIST_DOMAINS.some((d) => host === d || host.endsWith("." + d));
  }
  let WHITELISTED = isWhitelisted();
  // Re-evaluate whitelist when user changes it
  setInterval(() => { WHITELISTED = isWhitelisted(); }, 5000);

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
  const META_BLOCK_KEYWORDS = [
    "porn","porno","xxx","nsfw","nude","naked","nudity","topless","onlyfans","hentai",
    "sex tape","sex scene","sexual","stripper","strip club","camgirl","escort","fetish",
    "boobs","tits","nipple","pussy","vagina","penis","dick","cock","masturbat","orgasm",
    "blowjob","anal","cum","gore","behead","bloodbath","suicide","self-harm","cocaine","heroin","meth",
    "порно","голая","голый","обнаж","сиськи","соски","член","топлесс","мастурб","оргазм",
    "yalang'och","yalangoch","behayo","jinsi a'zo","porno","fohisha"
  ];
  const META_SUSPECT_KEYWORDS = [
    "lingerie","thong","bikini","swimsuit","cleavage","twerk","grinding","seductive","sexy",
    "thirst trap","micro skirt","see through","see-through","bodycon","booty","butt",
    "tight dress","yoga pants","leggings","transparent","hot girl","model","fashion model",
    "try on haul","outfit ideas","female body","hips","ass","booty shorts","short skirt",
    "cosplay","dressootd","outfitlook","lookswap","look swap","big bank","brooke monk",
    "boat trend","tiktok challenge","challenge","viral shorts","mobilisation","mobilization",
    "купальник","нижнее белье","стринги","декольте","эрот","облегающ","танец","танцует",
    "kupalnik","ichki kiyim","tor kiyim","ochiq kiyim","raqsi","raqs","ko'krak","kokrak"
  ];
  const SITE_CONTAINER_SELECTORS = [
    "ytd-rich-item-renderer", "ytd-rich-grid-media", "ytd-rich-grid-slim-media",
    "ytd-video-renderer", "ytd-compact-video-renderer", "ytd-grid-video-renderer",
    "ytd-reel-item-renderer", "ytd-reel-video-renderer", "ytm-shorts-lockup-view-model",
    "article", "[data-test-id='pin']", "[data-grid-item]", "[data-visualcompletion]",
    "[data-testid='cellInnerDiv']", "div[style*='transform']", "ytd-thumbnail",
    "a", "[role='link']", "[role='button']"
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
  function pickFromSrcset(srcset) {
    if (!srcset) return "";
    const candidates = String(srcset).split(",").map((part) => part.trim().split(/\s+/)[0]).filter(Boolean);
    return candidates[candidates.length - 1] || "";
  }
  function mediaUrl(el) {
    const srcsetUrl = pickFromSrcset(el.srcset || el.getAttribute?.("srcset"));
    const attrs = [
      el.currentSrc, el.src, srcsetUrl,
      el.getAttribute?.("data-src"), el.getAttribute?.("data-original"),
      el.getAttribute?.("data-lazy-src"), el.getAttribute?.("data-actualsrc"),
    ];
    return attrs.find((u) => u && u !== BLANK_PIXEL) || "";
  }
  function extractYouTubeId(text) {
    const s = String(text || location.href);
    return s.match(/(?:youtube\.com\/watch\?v=|youtube\.com\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{6,})/)?.[1]
      || s.match(/[?&]v=([a-zA-Z0-9_-]{6,})/)?.[1]
      || s.match(/\/shorts\/([a-zA-Z0-9_-]{6,})/)?.[1]
      || "";
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
      `https://i.ytimg.com/vi_webp/${id}/maxresdefault.webp`,
      `https://i.ytimg.com/vi_webp/${id}/hqdefault.webp`,
    ];
  }
  function analysisUrlForVideo(video) {
    const poster = video.poster || "";
    if (poster && !poster.startsWith("blob:")) return poster;
    const yt = YOUTUBE_HOST ? extractYouTubeIdFromElement(video) : "";
    if (yt) return youtubeThumbs(yt)[0];
    return video.currentSrc || video.src || poster || location.href;
  }
  function analysisUrlsForElement(el, primaryUrl) {
    const urls = [];
    if (primaryUrl) urls.push(primaryUrl);
    if (YOUTUBE_HOST) urls.push(...youtubeThumbs(extractYouTubeIdFromElement(el)));
    return [...new Set(urls.filter(Boolean))];
  }
  const EXACT_KWS = new Set(["anal", "cum", "meth", "dick", "cock", "ass", "butt", "gore", "nude", "sex", "tits", "boobs", "hips", "dance", "model", "raqs"]);
  function checkKeywords(text, keywords) {
    const t = normalizeText(text);
    if (!t) return false;
    for (let i = 0; i < keywords.length; i++) {
      const kw = keywords[i];
      if (EXACT_KWS.has(kw)) {
        const regex = new RegExp(`(?:^|[^\\p{L}])${kw}(?:[^\\p{L}]|$)`, "iu");
        if (regex.test(t)) return true;
      } else {
        if (t.includes(kw)) return true;
      }
    }
    return false;
  }

  function containsRiskyKeyword(text) {
    return checkKeywords(text, RISKY_KEYWORDS);
  }
  function matchesRiskyUrl(url) {
    return RISKY_URL_PATTERNS.some((re) => re.test(url));
  }
  function collectContext(el, url) {
    const parts = [
      url, document.title, el.alt, el.title,
      el.getAttribute && el.getAttribute("aria-label"),
      el.closest && el.closest("a")?.href,
      el.closest && el.closest("a")?.textContent?.slice(0, 80),
      el.closest && el.closest("article")?.textContent?.slice(0, 160),
      el.closest && el.closest("ytd-rich-item-renderer,ytd-reel-video-renderer,ytd-video-renderer")?.textContent?.slice(0, 240),
      el.closest && el.closest("[role='link'],[role='button']")?.getAttribute?.("aria-label"),
      el.closest && el.closest("[role='link'],[role='button']")?.textContent?.slice(0, 160),
    ];
    return parts.filter(Boolean).join(" ").slice(0, 1000);
  }
  function hasMetaBlockRisk(text) {
    return checkKeywords(text, META_BLOCK_KEYWORDS);
  }
  function hasMetaSuspectRisk(text) {
    return checkKeywords(text, META_SUSPECT_KEYWORDS);
  }
  function hasStrongMediaRisk(text) {
    return checkKeywords(text, [
      "porn","porno","xxx","nsfw","nude","naked","hentai","onlyfans","boobs","nipple","pussy","penis","cock",
      "topless","upskirt","downblouse","masturbat","orgasm","anal","blowjob","gore","behead","suicide","self-harm",
      "порно","голая","голый","обнаж","сиськи","соски","член","топлесс","мастурб","оргазм","самоубий",
      "yalang'och","yalangoch","behayo","jinsi a'zo"
    ]);
  }
  function hasSoftMediaRisk(text) {
    return checkKeywords(text, ["sexy","erotic","lingerie","thong","cleavage","twerk","grinding","bikini","swimsuit","bodycon","leggings","tight dress","try on","outfit","dance","dancer","female giants","бикини","купальник","декольте","танец","ichki kiyim","kupalnik","tor kiyim","ochiq kiyim","raqsi","raqs","ko'krak","kokrak"]);
  }
  function youtubeCard(el) {
    if (!YOUTUBE_HOST) return null;
    return el.closest?.("ytd-rich-item-renderer,ytd-rich-grid-media,ytd-rich-grid-slim-media,ytd-video-renderer,ytd-compact-video-renderer,ytd-grid-video-renderer,ytd-reel-item-renderer,ytm-shorts-lockup-view-model,ytd-reel-video-renderer") || null;
  }
  function youtubeVisualBox(el) {
    return el.closest?.("ytd-thumbnail,yt-image,.ytp-videowall-still,.shortsLockupViewModelHostThumbnailContainer") || el.parentElement || el;
  }
  function nearestMediaContainer(el) {
    const yt = youtubeCard(el);
    if (yt) return yt;
    for (const sel of SITE_CONTAINER_SELECTORS) {
      const found = el.closest?.(sel);
      if (found) return found;
    }
    return el.parentElement || el;
  }
  function preShield(el, reason = "Tekshirilmoqda") {
    if (!VISUAL_RISK_HOST || WHITELISTED || el.dataset.aiRadarBlocked || el.dataset.aiRadarPreShield) return;
    const r = el.getBoundingClientRect();
    const min = minSizeFor(el);
    if ((r.width || el.offsetWidth || 0) < min || (r.height || el.offsetHeight || 0) < min) return;
    el.dataset.aiRadarPreShield = "1";
    const box = nearestMediaContainer(el);
    if (!box || box.dataset.aiRadarPreShieldBox) return;
    box.dataset.aiRadarPreShieldBox = "1";
    // pending shield must never disable the original site card
    const visualBox = YOUTUBE_HOST ? youtubeVisualBox(el) : box;
    if (getComputedStyle(visualBox).position === "static") visualBox.style.position = "relative";
    const shield = document.createElement("div");
    shield.className = YOUTUBE_HOST ? "ai-radar-pre-shield ai-radar-pre-shield--compact" : "ai-radar-pre-shield";
    shield.textContent = `🛡️ ${reason}`;
    visualBox.appendChild(shield);
  }
  function clearPreShield(el) {
    try {
      delete el.dataset.aiRadarPreShield;
      el.dataset.aiRadarSafe = "1";
      const box = nearestMediaContainer(el);
      box?.querySelectorAll?.(".ai-radar-pre-shield").forEach((n) => n.remove());
      box?.classList?.remove("ai-radar-preblocked-container");
      if (box?.dataset) delete box.dataset.aiRadarPreShieldBox;
    } catch {}
  }
  function localBlockDecision(el, url) {
    // Partner Mode: meta/page context never blocks by itself; it only decides whether AI should inspect.
    const mediaText = [url, el.alt, el.title, el.getAttribute && el.getAttribute("aria-label")].filter(Boolean).join(" ");
    const pageContext = collectContext(el, url);
    if (matchesRiskyUrl(url) || hasStrongMediaRisk(mediaText)) {
      return { block: true, reason: "Xavfli media URL/matn" };
    }
    if (hasStrongMediaRisk(pageContext) || hasMetaBlockRisk(pageContext) || hasSoftMediaRisk(mediaText) || hasSoftMediaRisk(pageContext) || hasMetaSuspectRisk(pageContext)) {
      return { block: false, suspicious: true, reason: "Riskli kontekst" };
    }
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
  const STOP_EVENTS = ["click", "mousedown", "mouseup", "pointerdown", "pointerup", "touchstart", "auxclick", "contextmenu"];
  function saveBlockedYoutubeIds() {
    try { localStorage.setItem("__ai_radar_blocked_yt_ids__", JSON.stringify([...BLOCKED_YOUTUBE_IDS].slice(-400))); } catch {}
  }
  function rememberBlockedYoutube(el) {
    if (!YOUTUBE_HOST) return;
    const id = extractYouTubeIdFromElement(el);
    if (id) { BLOCKED_YOUTUBE_IDS.add(id); saveBlockedYoutubeIds(); }
  }
  function isBlockedYoutubeNavigation(target) {
    if (!YOUTUBE_HOST) return false;
    const a = target?.closest?.("a[href]");
    if (!a) return false;
    const id = extractYouTubeId(a.href);
    return !!id && BLOCKED_YOUTUBE_IDS.has(id);
  }
  const hardStop = (e) => {
    const blocked = e.target?.closest?.("[data-ai-radar-blocked-container='1'],.ai-radar-wrapper,.ai-radar-shield,.ai-radar-blocked,.ai-radar-youtube-hidden-card");
    if (!blocked && !isBlockedYoutubeNavigation(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    return false;
  };
  STOP_EVENTS.forEach((evt) => document.addEventListener(evt, hardStop, { capture: true, passive: false }));

  function neutralizeContainer(el) {
    rememberBlockedYoutube(el);
    const selectors = [
      "ytd-rich-item-renderer", "ytd-rich-grid-media", "ytd-rich-grid-slim-media", "ytd-video-renderer",
      "ytd-compact-video-renderer", "ytd-grid-video-renderer", "ytd-reel-item-renderer", "ytm-shorts-lockup-view-model",
      "ytd-reel-video-renderer", "ytd-thumbnail", "a", "[role='link']", "[role='button']", "article",
      "[data-test-id='pin']", "[data-grid-item]", "div[style*='transform']"
    ];
    const targets = new Set([el]);
    selectors.forEach((sel) => { const t = el.closest?.(sel); if (t) targets.add(t); });
    targets.forEach((t) => {
      t.dataset.aiRadarBlockedContainer = "1";
      t.querySelectorAll?.("a[href]").forEach((a) => {
        if (a.href) a.dataset.aiRadarOrigHref = a.href;
        try { a.removeAttribute("href"); } catch {}
        a.setAttribute("aria-disabled", "true");
      });
      if (t.href) { t.dataset.aiRadarOrigHref = t.href; try { t.removeAttribute("href"); } catch {} }
      if (t.getAttribute?.("role") === "link") t.setAttribute("aria-disabled", "true");
      try { t.style.cursor = "not-allowed"; } catch {}
      STOP_EVENTS.forEach((evt) => t.addEventListener(evt, hardStop, { capture: true, passive: false }));
    });
  }
  function collapseYoutubeCard(_el) {
    // Never remove YouTube cards; harmful media is blurred/shielded in place.
    return false;
  }

  function softBlur(el, reason) {
    if (!el || el.dataset.aiRadarBlocked || el.classList.contains("safe-blur")) return;
    el.classList.add("safe-blur");
    el.dataset.aiRadarSoftBlur = reason || "Sherik AI: shubhali";
    clearPreShield(el);
    blockedCount++;
    stats.totalBlocked = blockedCount;
    stats.localBlocked++;
    persistStats({ lastBlock: { reason: reason || "soft-blur", host: location.hostname, ts: Date.now() } });
    try { chrome.runtime?.sendMessage?.({ type: "blocked", count: blockedCount }); } catch {}
  }

  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!t || !t.classList?.contains("safe-blur")) return;
    e.preventDefault();
    e.stopPropagation();
    t.classList.toggle("safe-blur-revealed");
  }, { capture: true, passive: false });

  function shieldElement(el, reason, source = "local") {
    if (VISUAL_RISK_HOST && (el.tagName === "IMG" || el.tagName === "VIDEO")) {
      softBlur(el, reason);
      return;
    }
    if (el.dataset.aiRadarBlocked) return;
    el.dataset.aiRadarBlocked = "1";
    clearPreShield(el);
    const rectBefore = el.getBoundingClientRect();
    neutralizeContainer(el);
    const collapsedYoutubeCard = collapseYoutubeCard(el);
    blockedCount++;
    stats.totalBlocked = blockedCount;
    if (source === "cloud") stats.cloudBlocked++;
    else stats.localBlocked++;
    const lastBlock = { reason: reason || "", host: location.hostname, ts: Date.now() };
    // 7-kunlik ring buffer + top hostlar
    try {
      chrome.storage?.local?.get?.(["dailyBlocks", "hostBlocks"], (s) => {
        const today = new Date().toISOString().slice(0, 10);
        const db = (s.dailyBlocks && typeof s.dailyBlocks === "object") ? { ...s.dailyBlocks } : {};
        db[today] = (db[today] || 0) + 1;
        const cutoff = Date.now() - 7 * 86400000;
        for (const k of Object.keys(db)) {
          if (new Date(k).getTime() < cutoff) delete db[k];
        }
        const hb = (s.hostBlocks && typeof s.hostBlocks === "object") ? { ...s.hostBlocks } : {};
        const host = location.hostname.replace(/^www\./, "");
        hb[host] = (hb[host] || 0) + 1;
        // Faqat top-20 ni saqlash (storage shishmasligi uchun)
        const trimmed = Object.entries(hb)
          .sort((a, b) => b[1] - a[1]).slice(0, 20)
          .reduce((acc, [k, v]) => (acc[k] = v, acc), {});
        chrome.storage?.local?.set?.({ ...stats, lastBlock, dailyBlocks: db, hostBlocks: trimmed });
      });
    } catch {
      persistStats({ lastBlock });
    }
    try { chrome.runtime?.sendMessage?.({ type: "blocked", count: blockedCount }); } catch {}
    if (collapsedYoutubeCard) return;

    // HARD-REMOVE strategiyasi:
    // Asl elementni butunlay yashirib, o'rniga shield div qo'yamiz.
    // Asl element DOM'da qoladi (sayt skripti buzilmasligi uchun) lekin
    // 0x0 o'lcham, ko'rinmas, click yo'q. Bypass mutlaqo mumkin emas.

    if (el.tagName === "IMG") {
      try {
        if (el.src && el.src !== BLANK_PIXEL) el.dataset.aiRadarOrig = el.src;
        if (el.srcset) { el.dataset.aiRadarSrcset = el.srcset; el.removeAttribute("srcset"); }
        const picture = el.closest?.("picture");
        picture?.querySelectorAll?.("source").forEach((s) => {
          if (s.srcset) s.dataset.aiRadarSrcset = s.srcset;
          s.removeAttribute("srcset");
          s.removeAttribute("media");
        });
        el.removeAttribute("sizes");
        el.src = BLANK_PIXEL;
      } catch {}
    } else if (el.tagName === "VIDEO") {
      try {
        el.pause();
        el.muted = true;
        el.removeAttribute("autoplay");
        el.removeAttribute("controls");
        if (el.src) { el.dataset.aiRadarOrig = el.src; el.removeAttribute("src"); }
        el.querySelectorAll("source").forEach((s) => {
          s.dataset.aiRadarOrig = s.src;
          s.removeAttribute("src");
        });
        el.load();
        if (el.poster) { el.dataset.aiRadarOrigPoster = el.poster; el.poster = BLANK_PIXEL; }
      } catch {}
    }

    el.classList.add("ai-radar-blocked");
    el.setAttribute("aria-hidden", "true");

    STOP_EVENTS.forEach((evt) => {
      el.addEventListener(evt, hardStop, { capture: true, passive: false });
    });

    // Parent <a> ni neytrallash
    const anchor = el.closest && el.closest("a");
    if (anchor && !anchor.dataset.aiRadarBlockedLink) {
      anchor.dataset.aiRadarBlockedLink = "1";
      if (anchor.href) anchor.dataset.aiRadarOrigHref = anchor.href;
      try { anchor.removeAttribute("href"); } catch {}
      anchor.style.cursor = "not-allowed";
      STOP_EVENTS.forEach((evt) => {
        anchor.addEventListener(evt, hardStop, { capture: true, passive: false });
      });
    }

    // Shield qatlami: asl elementning ustiga, balandroq z-index, click bloki
    const w = Math.max(rectBefore.width || el.offsetWidth || 200, 80);
    const h = Math.max(rectBefore.height || el.offsetHeight || 200, 80);

    // Wrapper: position relative, asl o'lchamni saqlab turish
    const wrapper = document.createElement("div");
    wrapper.className = "ai-radar-wrapper";
    Object.assign(wrapper.style, {
      position: "relative",
      display: "inline-block",
      width: w + "px",
      height: h + "px",
      overflow: "hidden",
      verticalAlign: "middle",
    });

    const shield = document.createElement("div");
    shield.className = "ai-radar-shield";
    shield.innerHTML = '<div class="icon">🛡️</div><div class="title">Bloklandi</div><div class="reason"></div>';
    shield.querySelector(".reason").textContent = (reason || "Zararli kontent").slice(0, 100);
    Object.assign(shield.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
    });
    STOP_EVENTS.forEach((evt) => {
      shield.addEventListener(evt, hardStop, { capture: true, passive: false });
    });

    // Asl elementni wrapper ichiga ko'chirib, ustiga shield qo'yamiz
    try {
      const parent = el.parentNode;
      if (parent) {
        parent.insertBefore(wrapper, el);
        // Asl elementni absolutely yashirib qo'yamiz (sayt skriptlari uchun)
        Object.assign(el.style, {
          position: "absolute",
          left: "-9999px",
          top: "-9999px",
          width: "1px",
          height: "1px",
          opacity: "0",
          visibility: "hidden",
          pointerEvents: "none",
        });
        wrapper.appendChild(el);
        wrapper.appendChild(shield);
      }
    } catch {}
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

  function mediaVisibleSize(el) {
    const r = el.getBoundingClientRect();
    const w = r.width || el.offsetWidth || el.naturalWidth || el.videoWidth || 0;
    const h = r.height || el.offsetHeight || el.naturalHeight || el.videoHeight || 0;
    return { w, h };
  }
  function minSizeFor(el) {
    if (YOUTUBE_AGGRESSIVE_MODE && (el?.tagName === "IMG" || el?.tagName === "VIDEO")) return 110;
    return MIN_SIZE;
  }

  function shouldFailClosed(_el, _local = {}, _visualSignal = false) {
    // Partner Mode: network/model errors must never hide safe content.
    // Block only from explicit local/AI risky verdicts.
    return false;
  }

  async function firstBlockingAnalysis(urls, failClosed = false, fast = true) {
    let last = { block: failClosed, reason: failClosed ? "Tekshiruv yakunlanmadi — xavfsizlik bloki" : "" };
    for (const u of urls) {
      const result = await analyzeMediaUrlPreferBase64(u, failClosed, fast);
      last = result;
      if (result.block) return result;
    }
    return last;
  }

  // ========== AI request ==========
  async function analyzeUrl(url, failClosed = false, fast = true) {
    if (aiDisabled) return { block: failClosed, reason: failClosed ? "AI tekshiruvi mavjud emas — xavfsizlik bloki" : "" };
    const key = urlHash(url);
    if (CACHE[key]) return { block: CACHE[key].b, reason: CACHE[key].r || "" };
    try {
      const res = await fetch(`${API_BASE}/analyze-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ANON_KEY}`, "apikey": ANON_KEY },
        body: JSON.stringify({ image_url: url, fast, language: "uz" }),
      });
      if (res.status === 402 || res.status === 429) {
        aiDisabled = true;
        console.warn("[AI Radar] AI quota tugadi — lokal filtr ishlaydi");
        return { block: failClosed, reason: failClosed ? "AI kvota tugadi — xavfsizlik bloki" : "" };
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const result = { block: !!data.should_block, reason: data.block_reason || data.category || "" };
      CACHE[key] = { b: result.block, r: result.reason, t: Date.now() };
      cacheDirty = true;
      return result;
    } catch (e) {
      return { block: failClosed, reason: failClosed ? "Tekshiruv xatosi — xavfsizlik bloki" : "" };
    }
  }
  async function analyzeBase64(base64, failClosed = false, fast = true) {
    if (aiDisabled) return { block: failClosed, reason: failClosed ? "AI tekshiruvi mavjud emas — xavfsizlik bloki" : "" };
    try {
      const res = await fetch(`${API_BASE}/analyze-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ANON_KEY}`, "apikey": ANON_KEY },
        body: JSON.stringify({ image_base64: base64, fast, language: "uz" }),
      });
      if (res.status === 402 || res.status === 429) { aiDisabled = true; return { block: failClosed, reason: failClosed ? "AI kvota tugadi — xavfsizlik bloki" : "" }; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return { block: !!data.should_block, reason: data.block_reason || data.category || "" };
    } catch { return { block: failClosed, reason: failClosed ? "Tekshiruv xatosi — xavfsizlik bloki" : "" }; }
  }
  async function analyzeMediaUrlPreferBase64(url, failClosed = false, fast = true) {
    if (!url) return { block: failClosed, reason: failClosed ? "Media URL topilmadi — xavfsizlik bloki" : "" };
    if (url.startsWith("data:image/")) return analyzeBase64(url.split(",")[1], failClosed, fast);
    const dataUrl = await fetchImageViaBackground(url);
    if (dataUrl?.startsWith("data:image/")) return analyzeBase64(dataUrl.split(",")[1], failClosed, fast);
    return analyzeUrl(url, failClosed, fast);
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
    if (paused) return;
    if (img.dataset.aiRadarBlocked) return;
    const url = mediaUrl(img);
    if (!url || url === BLANK_PIXEL || url.length < 10) return;
    if (PROCESSING.get(img) === url) return;
    if (!img.complete || !img.naturalWidth) {
      img.addEventListener("load", () => processImage(img), { once: true });
      return;
    }
    const min = minSizeFor(img);
    if (img.naturalWidth < min || img.naturalHeight < min) return;

    PROCESSING.set(img, url);
    // no pre-shield: thumbnails stay visible while AI checks in background

    // 1. Local URL/keyword
    const local = localBlockDecision(img, url);
    if (local.block) { shieldElement(img, local.reason, "local"); return; }

    // 2. Whitelist domain → AI'siz o'tkaz
    if (WHITELISTED) return;

    img.classList.add("ai-radar-scanning");

    // 3. LOKAL NSFW MODEL (NSFWJS) — CORS bypass bilan
    let robustData = null;
    let visualSuspicious = false;
    if (nsfwReady) {
      const r = await classifyRobust(url);
      if (r && r.preds) {
        if (r.dataUrl) robustData = r.dataUrl; // background fetch ishlatildi
        const decision = decideFromNsfw(r.preds, VISUAL_RISK_HOST || local.suspicious);
        if (decision?.suspicious) visualSuspicious = true;
        if (decision?.block) {
          img.classList.remove("ai-radar-scanning");
          shieldElement(img, decision.reason, "local");
          return;
        }
        if (decision?.confident && !decision.block && !VISUAL_RISK_HOST && !local.suspicious) {
          img.classList.remove("ai-radar-scanning");
          clearPreShield(img);
          noteLocalApproved();
          return;
        }
      }
    }

    // 4. Lokal skin-tone (NSFW yo'q bo'lsa fallback)
    const { skinPct, error } = await analyzeSkinToneLocal(img);
    img.classList.remove("ai-radar-scanning");

    const highSkin = !error && skinPct > (VISUAL_RISK_HOST ? 0.26 : 0.48) && img.naturalWidth >= 220;
    if (YOUTUBE_HOST && (local.suspicious || hasSoftMediaRisk(collectContext(img, url))) && !error && skinPct > 0.18) {
      visualSuspicious = true;
    }

    const failClosed = shouldFailClosed(img, local, highSkin || visualSuspicious);
    // 5. Cloud AI (faqat haqiqatan shubhali holatlarda) — base64 bo'lsa undan foydalan
    if (aiDisabled) {
      if (failClosed) shieldElement(img, "AI mavjud emas — xavfsizlik bloki", "local");
      else clearPreShield(img);
      return;
    }
    const shouldUseCloud = local.suspicious || highSkin || visualSuspicious;
    if (shouldUseCloud) {
      enqueue(async () => {
        let result;
        if (robustData || url.startsWith("data:image/")) {
          const b64 = (robustData || url).split(",")[1];
          result = await analyzeBase64(b64, failClosed, !YOUTUBE_AGGRESSIVE_MODE);
        } else result = await firstBlockingAnalysis(analysisUrlsForElement(img, url), failClosed, !YOUTUBE_AGGRESSIVE_MODE);
        if (result.block) shieldElement(img, result.reason, "cloud");
        else clearPreShield(img);
      });
    } else {
      clearPreShield(img);
    }
  }

  function processVideo(video) {
    if (paused) return;
    if (video.dataset.aiRadarBlocked) return;
    const poster = analysisUrlForVideo(video);
    const key = `${poster}|${video.currentSrc || video.src || ""}|${location.href}`;
    if (PROCESSING.get(video) === key) return;
    const local = localBlockDecision(video, poster);
    if (local.block) { shieldElement(video, local.reason, "local"); return; }
    if (WHITELISTED) return;

    PROCESSING.set(video, key);
    // no pre-shield: video stays visible while AI checks in background
    const contextText = collectContext(video, poster);
    if (YOUTUBE_HOST && (local.suspicious || hasSoftMediaRisk(contextText) || hasMetaSuspectRisk(contextText))) {
      scheduleVideoBurst(video);
    }
    if (local.suspicious || hasSoftMediaRisk(contextText)) {
      setTimeout(() => { if (!video.dataset.aiRadarBlocked) captureFrame(video, false); }, 250);
    }
    if (poster && !poster.startsWith("data:") && !poster.startsWith("blob:")) {
      enqueue(async () => {
        const { block, reason } = await firstBlockingAnalysis(
          analysisUrlsForElement(video, poster),
          shouldFailClosed(video, local, true),
          !YOUTUBE_AGGRESSIVE_MODE,
        );
        if (block) shieldElement(video, reason, "cloud");
        else scheduleVideoBurst(video);
      });
    } else {
      enqueue(() => captureFrame(video, false));
    }
    // continuous scan disabled; only visible/new videos are sampled once/burst
    scheduleVideoBurst(video);
    video.addEventListener("playing", () => scheduleVideoBurst(video));
    // continuous scan listener disabled
    video.addEventListener("pause", () => stopContinuousVideoScan(video));
    video.addEventListener("ended", () => stopContinuousVideoScan(video));
  }

  function scheduleVideoBurst(video) {
    if (video.dataset.aiRadarBursting) return;
    video.dataset.aiRadarBursting = "1";
    // Partner Mode: short burst only; no endless/continuous video analysis.
    [600, 3000].forEach((ms) => {
      setTimeout(() => {
        if (!video.dataset.aiRadarBlocked && document.contains(video)) captureFrame(video, false);
      }, ms);
    });
    setTimeout(() => { try { delete video.dataset.aiRadarBursting; } catch {} }, 8000);
  }

  function stopContinuousVideoScan(video) {
    const timer = VIDEO_SCAN_TIMERS.get(video);
    if (timer) clearInterval(timer);
    VIDEO_SCAN_TIMERS.delete(video);
  }
  function startContinuousVideoScan(video) {
    if (VIDEO_SCAN_TIMERS.has(video)) return;
    const timer = setInterval(() => {
      if (!document.contains(video) || video.dataset.aiRadarBlocked) {
        stopContinuousVideoScan(video);
        return;
      }
      if (video.paused || video.ended || video.readyState < 2) return;
      captureFrame(video, true);
    }, 2200);
    VIDEO_SCAN_TIMERS.set(video, timer);
  }

  function captureFrameDataUrl(video, w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    c.getContext("2d").drawImage(video, 0, 0, w, h);
    return c.toDataURL("image/jpeg", 0.6);
  }

  async function captureFrame(video, failClosed = false) {
    if (paused) return;
    if (video.readyState < 2) {
      video.addEventListener("loadeddata", () => captureFrame(video, failClosed), { once: true });
      return;
    }
    const W = Math.min(video.videoWidth || 256, 384);
    const H = Math.min(video.videoHeight || 256, 384);

    // Reels/TikTok kabi oqimlarda videoni seek qilish feedni buzadi; faqat hozirgi kadrni tekshiramiz.
    if (VISUAL_RISK_HOST) {
      await sampleCurrentVideoFrame(video, W, H, failClosed);
      return;
    }

    // Oddiy videolarda 3 ta frame'ni sample qilamiz (boshi, o'rtasi, oxiri yaqini)
    const samplePoints = [];
    const dur = isFinite(video.duration) ? video.duration : 0;
    if (dur > 2) {
      samplePoints.push(0, dur * 0.33, dur * 0.66);
    } else {
      samplePoints.push(video.currentTime || 0);
    }

    for (const t of samplePoints) {
      try {
        if (dur > 2 && Math.abs(video.currentTime - t) > 0.5) {
          await new Promise((resolve) => {
            const onSeek = () => { video.removeEventListener("seeked", onSeek); resolve(); };
            video.addEventListener("seeked", onSeek, { once: true });
            try { video.currentTime = t; } catch { resolve(); }
            setTimeout(resolve, 1500);
          });
        }
        const dataUrl = captureFrameDataUrl(video, W, H);

        // 1. Lokal NSFW (frame'ga)
        if (nsfwReady) {
          const r = await classifyLocal(dataUrl, 4000);
          if (r && r.preds) {
            const decision = decideFromNsfw(r.preds, VISUAL_RISK_HOST);
            if (decision?.block) { shieldElement(video, decision.reason, "local"); return; }
            if (decision?.confident && !decision.block && !VISUAL_RISK_HOST) { noteLocalApproved(); continue; }
          }
        }

        // 2. Cloud (faqat shubhali kadr)
        if (aiDisabled) continue;
        const b64 = dataUrl.split(",")[1];
        const { block, reason } = await analyzeBase64(b64, failClosed, !YOUTUBE_AGGRESSIVE_MODE);
        if (block) { shieldElement(video, reason, "cloud"); return; }
      } catch {}
    }
    clearPreShield(video);
  }

  async function sampleCurrentVideoFrame(video, W, H, failClosed = false) {
    try {
      const dataUrl = captureFrameDataUrl(video, W, H);
      if (nsfwReady) {
        const r = await classifyLocal(dataUrl, 4000);
        if (r && r.preds) {
          const decision = decideFromNsfw(r.preds, true);
          if (decision?.block) { shieldElement(video, decision.reason, "local"); return; }
          if (decision?.confident && !decision.block && !VISUAL_RISK_HOST) { noteLocalApproved(); clearPreShield(video); return; }
        }
      }
      if (aiDisabled) { if (failClosed) shieldElement(video, "AI mavjud emas — video xavfsizlik bloki", "local"); else clearPreShield(video); return; }
      const b64 = dataUrl.split(",")[1];
      const { block, reason } = await analyzeBase64(b64, failClosed, !YOUTUBE_AGGRESSIVE_MODE);
      if (block) shieldElement(video, reason, "cloud");
      else clearPreShield(video);
    } catch {}
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
    if (el.tagName !== "IMG" && el.tagName !== "VIDEO") return;
    // Partner Mode: no pre-blocking; analyze only visible/new media in background
    io.observe(el);
    const { w, h } = mediaVisibleSize(el);
    const min = minSizeFor(el);
    if (w >= min && h >= min) {
      if (el.tagName === "IMG") processImage(el);
      else processVideo(el);
    }
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
        } else {
          observe(m.target);
          if (m.target.tagName === "IMG") processImage(m.target);
          else processVideo(m.target);
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
    // interval rescan disabled; MutationObserver + scroll rescan handles new media
    console.log(`%c[AI Radar v6] 🛡️ Faol — ${WHITELISTED ? "whitelist" : "to'liq monitoring"}`, "color:#10b981;font-weight:bold");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
