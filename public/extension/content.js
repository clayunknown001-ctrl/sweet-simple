/**
 * AI Radar — Content Script v4
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
  const MAX_CONCURRENT = 4;
  // v8: fail-soft safe cache bekor, visual-risk saytlar uchun qat'iyroq qayta tahlil
  const CACHE_KEY = "__ai_radar_cache_v8__";
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
        chrome.runtime.sendMessage({ type: "fetch-image", url }, (resp) => {
          if (chrome.runtime?.lastError) return resolve(null);
          if (resp?.ok) resolve(resp.dataUrl); else resolve(null);
        });
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
  const VISUAL_RISK_DOMAINS = [
    "instagram.com", "youtube.com", "youtu.be", "pinterest.com", "tiktok.com",
    "x.com", "twitter.com", "reddit.com", "threads.net", "snapchat.com",
  ];
  const VISUAL_RISK_HOST = hostMatches(VISUAL_RISK_DOMAINS);

  // v2.2: zararli kontent o'tib ketmasligi uchun NSFW threshold'lar qat'iylashtirildi.
  function decideFromNsfw(preds, strict = false) {
    if (!preds) return null;
    const porn = preds.Porn || 0;
    const hentai = preds.Hentai || 0;
    const sexy = preds.Sexy || 0;
    const neutral = preds.Neutral || 0;
    const drawing = preds.Drawing || 0;
    const pornT = strict ? 0.32 : 0.48;
    const hentaiT = strict ? 0.36 : 0.52;
    if (porn > pornT) return { block: true, reason: "Behayo kontent", confident: true };
    if (hentai > hentaiT) return { block: true, reason: "Hentai", confident: true };
    if (porn + hentai > (strict ? 0.42 : 0.52)) return { block: true, reason: "Behayo kontent", confident: true };
    if (strict && sexy > 0.6 && neutral < 0.45) return { block: true, reason: "Erotik/ochiq kontent", confident: true };
    if (strict && sexy > 0.48) return { block: false, confident: false, suspicious: true };
    if (neutral > 0.82 && porn + hentai < 0.08 && sexy < 0.35) return { block: false, confident: true };
    if (drawing > 0.7 && porn + hentai < 0.15) return { block: false, confident: true };
    if (porn + hentai > 0.16 || sexy > 0.45) return { block: false, confident: false, suspicious: true };
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
    "купальник","нижнее белье","стринги","декольте","эрот","kupalnik","ichki kiyim"
  ];
  const SITE_CONTAINER_SELECTORS = [
    "article", "a", "[role='link']", "[role='button']", "[data-testid='cellInnerDiv']",
    "[data-test-id='pin']", "[data-grid-item]", "[data-visualcompletion]",
    "div[style*='transform']", "ytd-rich-item-renderer", "ytd-video-renderer",
    "ytd-reel-video-renderer", "ytd-thumbnail"
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
    return s.match(/(?:youtube\.com\/watch\?v=|youtube\.com\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{6,})/)?.[1] || "";
  }
  function analysisUrlForVideo(video) {
    const poster = video.poster || "";
    if (poster && !poster.startsWith("blob:")) return poster;
    const yt = hostMatches(["youtube.com", "youtu.be"]) ? extractYouTubeId(location.href) : "";
    if (yt) return `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`;
    return video.currentSrc || video.src || poster || location.href;
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
      el.closest && el.closest("a")?.textContent?.slice(0, 80),
      el.closest && el.closest("article")?.textContent?.slice(0, 160),
      el.closest && el.closest("ytd-rich-item-renderer,ytd-reel-video-renderer,ytd-video-renderer")?.textContent?.slice(0, 240),
      el.closest && el.closest("[role='link'],[role='button']")?.getAttribute?.("aria-label"),
      el.closest && el.closest("[role='link'],[role='button']")?.textContent?.slice(0, 160),
    ];
    return parts.filter(Boolean).join(" ").slice(0, 1000);
  }
  function hasMetaBlockRisk(text) {
    const t = normalizeText(text);
    if (!t) return false;
    return META_BLOCK_KEYWORDS.some((kw) => t.includes(kw));
  }
  function hasMetaSuspectRisk(text) {
    const t = normalizeText(text);
    if (!t) return false;
    return META_SUSPECT_KEYWORDS.some((kw) => t.includes(kw));
  }
  function hasStrongMediaRisk(text) {
    const t = normalizeText(text);
    if (!t) return false;
    return [
      "porn","porno","xxx","nsfw","nude","naked","hentai","onlyfans","boobs","nipple","pussy","penis","cock",
      "topless","upskirt","downblouse","masturbat","orgasm","anal","blowjob","gore","behead","suicide","self-harm",
      "порно","голая","голый","обнаж","сиськи","соски","член","топлесс","мастурб","оргазм","самоубий",
      "yalang'och","yalangoch","behayo","jinsi a'zo"
    ].some((kw) => t.includes(kw));
  }
  function hasSoftMediaRisk(text) {
    const t = normalizeText(text);
    if (!t) return false;
    return ["sexy","erotic","lingerie","thong","cleavage","twerk","grinding","бикини","купальник","декольте","ichki kiyim","kupalnik"].some((kw) => t.includes(kw));
  }
  function nearestMediaContainer(el) {
    for (const sel of SITE_CONTAINER_SELECTORS) {
      const found = el.closest?.(sel);
      if (found) return found;
    }
    return el.parentElement || el;
  }
  function preShield(el, reason = "Tekshirilmoqda") {
    if (!VISUAL_RISK_HOST || WHITELISTED || el.dataset.aiRadarBlocked || el.dataset.aiRadarPreShield) return;
    const r = el.getBoundingClientRect();
    if ((r.width || el.offsetWidth || 0) < MIN_SIZE || (r.height || el.offsetHeight || 0) < MIN_SIZE) return;
    el.dataset.aiRadarPreShield = "1";
    const box = nearestMediaContainer(el);
    if (!box || box.dataset.aiRadarPreShieldBox) return;
    box.dataset.aiRadarPreShieldBox = "1";
    box.classList.add("ai-radar-preblocked-container");
    if (getComputedStyle(box).position === "static") box.style.position = "relative";
    const shield = document.createElement("div");
    shield.className = "ai-radar-pre-shield";
    shield.textContent = `🛡️ ${reason}`;
    box.appendChild(shield);
  }
  function clearPreShield(el) {
    try {
      delete el.dataset.aiRadarPreShield;
      const box = nearestMediaContainer(el);
      box?.querySelectorAll?.(":scope > .ai-radar-pre-shield").forEach((n) => n.remove());
      box?.classList?.remove("ai-radar-preblocked-container");
      if (box?.dataset) delete box.dataset.aiRadarPreShieldBox;
    } catch {}
  }
  function localBlockDecision(el, url) {
    const mediaText = [url, el.alt, el.title, el.getAttribute && el.getAttribute("aria-label")].filter(Boolean).join(" ");
    const pageContext = collectContext(el, url);
    const isTinyProfile = el.tagName === "IMG" && Math.max(el.naturalWidth || 0, el.naturalHeight || 0) < 220;
    if (matchesRiskyUrl(url) || hasStrongMediaRisk(mediaText) || (!isTinyProfile && hasMetaBlockRisk(pageContext))) {
      return { block: true, reason: "Xavfli matn/media belgisi" };
    }
    if (hasSoftMediaRisk(mediaText) || hasStrongMediaRisk(pageContext) || hasSoftMediaRisk(pageContext) || hasMetaSuspectRisk(pageContext)) {
      // Instagram/Pinterest/YouTube kabi saytlarda bitta caption/comment butun grid/reelsni bloklab qo'ymasligi kerak.
      // Kontekst riskli bo'lsa visual AI'ga yuboramiz, lekin darhol hard-block qilmaymiz.
      return { block: false, suspicious: true, reason: "Riskli matn/kontekst" };
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
  const hardStop = (e) => {
    const blocked = e.target?.closest?.("[data-ai-radar-blocked-container='1'],[data-ai-radar-pre-shield-box='1'],.ai-radar-wrapper,.ai-radar-shield,.ai-radar-pre-shield,.ai-radar-blocked");
    if (!blocked) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    return false;
  };
  STOP_EVENTS.forEach((evt) => document.addEventListener(evt, hardStop, { capture: true, passive: false }));

  function neutralizeContainer(el) {
    const selectors = [
      "a", "[role='link']", "[role='button']", "article",
      "ytd-rich-item-renderer", "ytd-video-renderer", "ytd-reel-video-renderer", "ytd-thumbnail",
      "[data-test-id='pin']", "[data-grid-item]", "div[style*='transform']"
    ];
    const targets = new Set([el]);
    selectors.forEach((sel) => { const t = el.closest?.(sel); if (t) targets.add(t); });
    targets.forEach((t) => {
      t.dataset.aiRadarBlockedContainer = "1";
      if (t.href) { t.dataset.aiRadarOrigHref = t.href; try { t.removeAttribute("href"); } catch {} }
      if (t.getAttribute?.("role") === "link") t.setAttribute("aria-disabled", "true");
      try { t.style.cursor = "not-allowed"; } catch {}
      STOP_EVENTS.forEach((evt) => t.addEventListener(evt, hardStop, { capture: true, passive: false }));
    });
  }

  function shieldElement(el, reason, source = "local") {
    if (el.dataset.aiRadarBlocked) return;
    el.dataset.aiRadarBlocked = "1";
    clearPreShield(el);
    const rectBefore = el.getBoundingClientRect();
    neutralizeContainer(el);
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

  function shouldFailClosed(el, local = {}, visualSignal = false) {
    if (WHITELISTED) return false;
    if (local.block || local.suspicious) return true;
    return !!visualSignal;
  }

  // ========== AI request ==========
  async function analyzeUrl(url, failClosed = false) {
    if (aiDisabled) return { block: failClosed, reason: failClosed ? "AI tekshiruvi mavjud emas — xavfsizlik bloki" : "" };
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
  async function analyzeBase64(base64, failClosed = false) {
    if (aiDisabled) return { block: failClosed, reason: failClosed ? "AI tekshiruvi mavjud emas — xavfsizlik bloki" : "" };
    try {
      const res = await fetch(`${API_BASE}/analyze-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ANON_KEY}`, "apikey": ANON_KEY },
        body: JSON.stringify({ image_base64: base64, fast: true, language: "uz" }),
      });
      if (res.status === 402 || res.status === 429) { aiDisabled = true; return { block: failClosed, reason: failClosed ? "AI kvota tugadi — xavfsizlik bloki" : "" }; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return { block: !!data.should_block, reason: data.block_reason || data.category || "" };
    } catch { return { block: failClosed, reason: failClosed ? "Tekshiruv xatosi — xavfsizlik bloki" : "" }; }
  }
  async function analyzeMediaUrlPreferBase64(url, failClosed = false) {
    if (!url) return { block: failClosed, reason: failClosed ? "Media URL topilmadi — xavfsizlik bloki" : "" };
    if (url.startsWith("data:image/")) return analyzeBase64(url.split(",")[1], failClosed);
    const dataUrl = await fetchImageViaBackground(url);
    if (dataUrl?.startsWith("data:image/")) return analyzeBase64(dataUrl.split(",")[1], failClosed);
    return analyzeUrl(url, failClosed);
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
    if (img.naturalWidth < MIN_SIZE || img.naturalHeight < MIN_SIZE) return;

    PROCESSING.set(img, url);
    preShield(img);

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

    const highSkin = !error && skinPct > 0.55 && img.naturalWidth >= 240;

    // 5. Cloud AI (faqat haqiqatan shubhali holatlarda) — base64 bo'lsa undan foydalan
    if (aiDisabled) return;
    const failClosed = shouldFailClosed(img, local, highSkin || visualSuspicious);
    const shouldUseCloud = local.suspicious || highSkin || VISUAL_RISK_HOST;
    if (shouldUseCloud) {
      enqueue(async () => {
        let result;
        if (robustData || url.startsWith("data:image/")) {
          const b64 = (robustData || url).split(",")[1];
          result = await analyzeBase64(b64, failClosed);
        } else result = await analyzeMediaUrlPreferBase64(url, failClosed);
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
    preShield(video);
    if (poster && !poster.startsWith("data:") && !poster.startsWith("blob:")) {
      enqueue(async () => {
        const { block, reason } = await analyzeMediaUrlPreferBase64(poster, shouldFailClosed(video, local, false));
        if (block) shieldElement(video, reason, "cloud");
        else setTimeout(() => captureFrame(video), 800);
      });
    } else {
      enqueue(() => captureFrame(video));
    }
    video.addEventListener("playing", () => {
      if (!video.dataset.aiRadarBlocked) {
        setTimeout(() => captureFrame(video), 800);
        setTimeout(() => captureFrame(video), 2400);
      }
    });
  }

  function captureFrameDataUrl(video, w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    c.getContext("2d").drawImage(video, 0, 0, w, h);
    return c.toDataURL("image/jpeg", 0.6);
  }

  async function captureFrame(video) {
    if (paused) return;
    if (video.readyState < 2) {
      video.addEventListener("loadeddata", () => captureFrame(video), { once: true });
      return;
    }
    const W = Math.min(video.videoWidth || 256, 384);
    const H = Math.min(video.videoHeight || 256, 384);

    // Reels/TikTok kabi oqimlarda videoni seek qilish feedni buzadi; faqat hozirgi kadrni tekshiramiz.
    if (VISUAL_RISK_HOST) {
      await sampleCurrentVideoFrame(video, W, H);
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
        const { block, reason } = await analyzeBase64(b64);
        if (block) { shieldElement(video, reason, "cloud"); return; }
      } catch {}
    }
    clearPreShield(video);
  }

  async function sampleCurrentVideoFrame(video, W, H) {
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
      if (aiDisabled) { clearPreShield(video); return; }
      const b64 = dataUrl.split(",")[1];
      const { block, reason } = await analyzeBase64(b64);
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
    setInterval(() => document.querySelectorAll("img, video").forEach(observe), 2500);
    console.log(`%c[AI Radar v4] 🛡️ Faol — ${WHITELISTED ? "whitelist" : "to'liq monitoring"}`, "color:#10b981;font-weight:bold");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
