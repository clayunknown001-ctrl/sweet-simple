/**
 * AI Radar — Content Script (v2 — kredit-chidamli)
 * Local filtr (kreditga bog'liq emas) + AI qatlam (kredit bor paytda)
 */
(function () {
  "use strict";
  if (window.__AI_RADAR_LOADED__) return;
  window.__AI_RADAR_LOADED__ = true;

  const API_BASE = "https://iwyntbeqdvsbzvmskpaw.supabase.co/functions/v1";
  const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3eW50YmVxZHZzYnp2bXNrcGF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0NDkyOTYsImV4cCI6MjA4ODAyNTI5Nn0.dwvan4-1Mifxo6r3WzFqxmdMiByJ63h1Jk4rkvUrc0g";

  const MIN_SIZE = 80;
  const MAX_CONCURRENT = 3;
  const CACHE = new Map();
  const PROCESSING = new WeakSet();
  const QUEUE = [];
  let active = 0;
  let blockedCount = 0;
  let aiDisabled = false;

  const RISKY_KEYWORDS = [
    "porn","porno","xxx","sex","sexy","nude","nudity","naked","nsfw","erotic","erotica","adult",
    "fetish","onlyfans","boobs","breast","tits","nipple","ass","butt","pussy","vagina","penis",
    "dick","cock","bikini","lingerie","thong","swimsuit","seethrough","see-through","topless",
    "cameltoe","upskirt","downblouse","cleavage","milf","hentai","camgirl","escort","stripper",
    "twerk","grinding","masturbat","orgasm","thirst trap","thirst-trap","ahegao",
    "gore","blood","kill","murder","behead","decapitat","suicide","selfharm","self-harm",
    "drug","cocaine","heroin","meth",
    "порно","порн","секс","эрот","голая","голые","голый","обнаж","сиськи","грудь","соски",
    "попа","задница","писька","пенис","член","купальник","нижнее белье","трусы","стринги",
    "топлесс","декольте","шлюха","проститут","эскорт","стриптиз","мастурб","оргазм",
    "анал","минет","кровь","убит","самоубий","наркотик","кокаин","героин",
    "behayo","jinsiy","yalang'och","yalangoch","ichki kiyim","kupalnik","ko'krak","kokrak",
    "seksual","sekisi","fohisha","jinsi a'zo","qon","o'ldir","narkotik",
  ];

  const RISKY_URL_PATTERNS = [
    /\/porn/i, /\/xxx/i, /\/nsfw/i, /\/adult/i, /\/sex/i, /\/nude/i, /\/erotic/i,
    /\/hentai/i, /\/onlyfans/i, /\/cam(girl|boy)/i, /\/bikini/i, /\/lingerie/i,
    /pornhub/i, /xvideos/i, /xhamster/i, /redtube/i, /youporn/i, /spankbang/i,
    /onlyfans/i, /chaturbate/i, /stripchat/i, /livejasmin/i, /brazzers/i, /xnxx/i,
    /\/r\/(gonewild|nsfw|porn|nude)/i,
  ];

  const BLOCKED_DOMAINS = [
    "pornhub.com","xvideos.com","xhamster.com","redtube.com","youporn.com","spankbang.com",
    "onlyfans.com","chaturbate.com","stripchat.com","livejasmin.com","brazzers.com",
    "xnxx.com","tube8.com","beeg.com","tnaflix.com","motherless.com","efukt.com",
  ];

  function normalizeText(value) {
    try { return decodeURIComponent(String(value || "")).toLowerCase().replace(/\+/g, " "); }
    catch { return String(value || "").toLowerCase(); }
  }
  function containsRiskyKeyword(text) {
    const t = normalizeText(text);
    return t && RISKY_KEYWORDS.some((kw) => t.includes(kw));
  }
  function matchesRiskyUrl(url) {
    return RISKY_URL_PATTERNS.some((re) => re.test(url));
  }
  function isBlockedDomain() {
    const host = location.hostname.toLowerCase();
    return BLOCKED_DOMAINS.some((d) => host === d || host.endsWith("." + d));
  }
  function collectElementContext(el, url) {
    const parts = [
      url, location.href, document.title,
      el.alt, el.title,
      el.getAttribute && el.getAttribute("aria-label"),
      el.getAttribute && el.getAttribute("data-test-id"),
      el.closest && el.closest("a")?.href,
      el.closest && el.closest("a")?.textContent,
      el.parentElement?.textContent,
      el.previousElementSibling?.textContent,
      el.nextElementSibling?.textContent,
    ];
    return parts.filter(Boolean).join(" \n ").slice(0, 1500);
  }
  function localBlockDecision(el, url) {
    if (matchesRiskyUrl(url)) return { block: true, reason: "Xavfli URL pattern" };
    if (containsRiskyKeyword(collectElementContext(el, url))) return { block: true, reason: "Riskli matn/kontekst" };
    return { block: false };
  }

  // --- Domain qora ro'yxati: butun sahifani bloklash ---
  if (isBlockedDomain()) {
    const css = document.createElement("style");
    css.textContent = `.ai-radar-fullpage{position:fixed;inset:0;background:#0f172a;color:#fff;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:system-ui,sans-serif;padding:32px;text-align:center}.ai-radar-fullpage h1{color:#ef4444;font-size:32px;margin-bottom:12px}.ai-radar-fullpage p{opacity:.8;max-width:480px}`;
    document.documentElement.appendChild(css);
    const overlay = document.createElement("div");
    overlay.className = "ai-radar-fullpage";
    overlay.innerHTML = `<div style="font-size:64px;margin-bottom:16px">🛡️</div><h1>Sayt bloklangan</h1><p>Bu sayt AI Radar tomonidan zararli kontent manbasi sifatida belgilangan.</p>`;
    document.documentElement.appendChild(overlay);
    try { chrome.runtime?.sendMessage?.({ type: "blocked", count: ++blockedCount }); } catch {}
    return;
  }

  // --- shield UI ---
  function shieldElement(el, reason) {
    if (el.dataset.aiRadarBlocked) return;
    el.dataset.aiRadarBlocked = "1";
    el.classList.add("ai-radar-blocked");
    blockedCount++;
    try { chrome.runtime?.sendMessage?.({ type: "blocked", count: blockedCount }); } catch {}
    if (el.tagName === "VIDEO") {
      try { el.pause(); el.muted = true; el.removeAttribute("autoplay"); } catch {}
    }
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
    el.insertAdjacentElement("afterend", shield);
  }

  // --- AI request ---
  async function analyzeUrl(url) {
    if (aiDisabled) return { block: false, reason: "" };
    if (CACHE.has(url)) return CACHE.get(url);
    try {
      const res = await fetch(`${API_BASE}/analyze-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ANON_KEY}`, "apikey": ANON_KEY },
        body: JSON.stringify({ image_url: url, fast: true, language: "uz" }),
      });
      if (res.status === 402 || res.status === 429) {
        aiDisabled = true;
        console.warn("[AI Radar] AI kredit/limit tugadi — faqat local filtr ishlaydi");
        return { block: false, reason: "" };
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const result = { block: !!data.should_block, reason: data.block_reason || data.category || "" };
      CACHE.set(url, result);
      return result;
    } catch (e) {
      console.warn("[AI Radar] analyzeUrl xato:", e);
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

  // --- queue ---
  function enqueue(task) { QUEUE.push(task); drain(); }
  function drain() {
    while (active < MAX_CONCURRENT && QUEUE.length) {
      const t = QUEUE.shift();
      active++;
      t().finally(() => { active--; drain(); });
    }
  }

  // --- scanners ---
  function processImage(img) {
    if (PROCESSING.has(img) || img.dataset.aiRadarBlocked) return;
    const url = img.currentSrc || img.src;
    if (!url || url.startsWith("data:") || url.length < 10) return;
    if (img.naturalWidth && img.naturalWidth < MIN_SIZE) return;
    const local = localBlockDecision(img, url);
    if (local.block) { shieldElement(img, local.reason); return; }
    if (aiDisabled) return;
    PROCESSING.add(img);
    img.classList.add("ai-radar-scanning");
    enqueue(async () => {
      const { block, reason } = await analyzeUrl(url);
      img.classList.remove("ai-radar-scanning");
      if (block) shieldElement(img, reason);
    });
  }

  function processVideo(video) {
    if (PROCESSING.has(video) || video.dataset.aiRadarBlocked) return;
    const poster = video.poster;
    const local = localBlockDecision(video, poster || video.currentSrc || video.src || "");
    if (local.block) { shieldElement(video, local.reason); return; }
    if (aiDisabled) return;
    if (poster && !poster.startsWith("data:")) {
      PROCESSING.add(video);
      enqueue(async () => {
        const { block, reason } = await analyzeUrl(poster);
        if (block) shieldElement(video, reason);
      });
      return;
    }
    captureFrame(video);
  }

  function captureFrame(video) {
    if (aiDisabled) return;
    if (video.readyState < 2) {
      video.addEventListener("loadeddata", () => captureFrame(video), { once: true });
      return;
    }
    if (PROCESSING.has(video)) return;
    PROCESSING.add(video);
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
      if (m.type === "attributes" && (m.target.tagName === "IMG" || m.target.tagName === "VIDEO")) {
        delete m.target.dataset.aiRadarBlocked;
        PROCESSING.delete(m.target);
        observe(m.target);
      }
    }
  });

  function start() {
    mo.observe(document.documentElement, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ["src", "poster", "srcset"],
    });
    document.querySelectorAll("img, video").forEach(observe);
    console.log("%c[AI Radar v2] 🛡️ Faol — local + AI", "color:#10b981;font-weight:bold");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
