/**
 * AI Radar — Real-Time Browser Content Monitor (v2 — kredit-chidamli)
 * ====================================================================
 * Ikki qatlamli himoya:
 *   1. LOCAL FILTR (kreditga bog'liq emas, har doim ishlaydi)
 *      - Keng risky keyword ro'yxati (en/ru/uz)
 *      - URL pattern tahlili (xxx, nsfw, adult, /porn/, ...)
 *      - Domain qora ro'yxati (pornhub, xvideos, ...)
 *      - Sahifa konteksti (alt, title, link, parent text)
 *   2. AI QATLAMI (kredit bor paytda — chuqur tahlil)
 *      - gemini-2.5-flash-lite (eng arzon, eng tez)
 *      - 402/429 xato bo'lsa — "AI off" rejimi yoqiladi va faqat local filtr
 */

(function () {
  "use strict";

  const API_BASE = "https://iwyntbeqdvsbzvmskpaw.supabase.co/functions/v1";
  const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3eW50YmVxZHZzYnp2bXNrcGF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0NDkyOTYsImV4cCI6MjA4ODAyNTI5Nn0.dwvan4-1Mifxo6r3WzFqxmdMiByJ63h1Jk4rkvUrc0g";

  const MIN_SIZE = 80;
  const MAX_CONCURRENT = 2;
  const CACHE = new Map();
  const PROCESSING = new WeakSet();
  const QUEUE = [];
  let activeRequests = 0;
  let aiDisabled = false; // 402/429 dan keyin AI o'chiriladi, faqat local filtr ishlaydi

  // ---- Risky keywords (en, ru, uz) ----
  const RISKY_KEYWORDS = [
    // English
    "porn","porno","xxx","sex","sexy","nude","nudity","naked","nsfw","erotic","erotica","adult",
    "fetish","onlyfans","boobs","breast","tits","nipple","ass","butt","pussy","vagina","penis",
    "dick","cock","bikini","lingerie","thong","swimsuit","seethrough","see-through","topless",
    "cameltoe","upskirt","downblouse","cleavage","milf","teen porn","hentai","camgirl","escort",
    "stripper","strip","twerk","grinding","masturbat","orgasm","hookup","tinder hot","hot girl",
    "thirst trap","thirst-trap","ahegao","gore","blood","kill","murder","behead","decapitat",
    "suicide","selfharm","self-harm","cutting","drug","cocaine","heroin","meth","weed porn",
    // Russian
    "порно","порн","секс","эрот","голая","голые","голый","обнаж","обнажен","сиськи","грудь",
    "соски","попа","задница","писька","пенис","член","купальник","нижнее белье","трусы","стринги",
    "топлесс","декольте","шлюха","проститут","эскорт","стриптиз","мастурб","оргазм","лесби",
    "анал","минет","кровь","убит","самоубий","наркотик","кокаин","героин",
    // Uzbek
    "behayo","jinsiy","yalang'och","yalangoch","ichki kiyim","kupalnik","ko'krak","kokrak",
    "qiziqarli qiz","seksual","sekisi","fohisha","jinsi a'zo","qon","o'ldir","oldir","narkotik",
  ];

  // ---- Risky URL patterns ----
  const RISKY_URL_PATTERNS = [
    /\/porn/i, /\/xxx/i, /\/nsfw/i, /\/adult/i, /\/sex/i, /\/nude/i, /\/erotic/i,
    /\/hentai/i, /\/onlyfans/i, /\/cam(girl|boy)/i, /\/bikini/i, /\/lingerie/i,
    /pornhub/i, /xvideos/i, /xhamster/i, /redtube/i, /youporn/i, /spankbang/i,
    /onlyfans/i, /chaturbate/i, /stripchat/i, /livejasmin/i, /brazzers/i,
    /\/r\/(gonewild|nsfw|porn|nude)/i,
  ];

  // ---- Sayt domeni qora ro'yxati ----
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
    if (!t) return false;
    return RISKY_KEYWORDS.some((kw) => t.includes(kw));
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
      el.alt, el.title, el.getAttribute && el.getAttribute("aria-label"),
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
    const ctx = collectElementContext(el, url);
    if (containsRiskyKeyword(ctx)) return { block: true, reason: "Riskli matn/kontekst" };
    return { block: false };
  }

  // ---- UI: shield ----
  const style = document.createElement("style");
  style.textContent = `
    .ai-radar-blocked { position: relative !important; filter: blur(40px) grayscale(1) brightness(0.4) !important; pointer-events: none !important; transition: filter 0.15s ease !important; }
    .ai-radar-shield { position: absolute; inset: 0; background: rgba(15, 23, 42, 0.95); color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: system-ui, -apple-system, sans-serif; font-size: 13px; text-align: center; padding: 12px; z-index: 999999; border: 2px solid #ef4444; border-radius: 8px; pointer-events: auto; }
    .ai-radar-shield .icon { font-size: 28px; margin-bottom: 6px; }
    .ai-radar-shield .title { font-weight: 700; color: #fca5a5; margin-bottom: 4px; }
    .ai-radar-shield .reason { opacity: 0.85; font-size: 11px; }
    .ai-radar-fullpage { position: fixed; inset: 0; background: #0f172a; color: #fff; z-index: 2147483647; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: system-ui, sans-serif; padding: 32px; text-align: center; }
    .ai-radar-fullpage h1 { color: #ef4444; font-size: 32px; margin-bottom: 12px; }
    .ai-radar-fullpage p { opacity: 0.8; max-width: 480px; }
  `;
  document.documentElement.appendChild(style);

  // Agar butun domen qora ro'yxatda — sahifani to'liq bloklash
  if (isBlockedDomain()) {
    const overlay = document.createElement("div");
    overlay.className = "ai-radar-fullpage";
    overlay.innerHTML = `
      <div style="font-size:64px;margin-bottom:16px">🛡️</div>
      <h1>Sayt bloklangan</h1>
      <p>Bu sayt AI Radar tomonidan zararli kontent manbasi sifatida belgilangan va sizning sog'lig'ingizni himoya qilish uchun yopildi.</p>
    `;
    document.documentElement.appendChild(overlay);
    console.log("%c[AI Radar] 🛡️ Domen bloklandi: " + location.hostname, "color:#ef4444;font-weight:bold");
    return;
  }

  function shieldElement(el, reason) {
    if (el.dataset.aiRadarBlocked) return;
    el.dataset.aiRadarBlocked = "1";
    el.classList.add("ai-radar-blocked");
    if (el.tagName === "VIDEO") {
      try { el.pause(); el.muted = true; el.removeAttribute("autoplay"); } catch {}
    }
    const parent = el.parentElement;
    if (parent && getComputedStyle(parent).position === "static") {
      parent.style.position = "relative";
    }
    const shield = document.createElement("div");
    shield.className = "ai-radar-shield";
    shield.innerHTML = `<div class="icon">🛡️</div><div class="title">Bloklangan</div><div class="reason">${(reason || "Zararli kontent").slice(0, 80)}</div>`;
    const rect = el.getBoundingClientRect();
    shield.style.width = rect.width + "px";
    shield.style.height = rect.height + "px";
    el.insertAdjacentElement("afterend", shield);
  }

  // ---- AI tahlili (FAST mode, lite model) ----
  async function analyzeImage(url) {
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
      console.warn("[AI Radar] tahlil xatosi:", e);
      return { block: false, reason: "" };
    }
  }

  // ---- Queue ----
  function enqueue(task) { QUEUE.push(task); drain(); }
  async function drain() {
    while (activeRequests < MAX_CONCURRENT && QUEUE.length > 0) {
      const task = QUEUE.shift();
      activeRequests++;
      task().finally(() => { activeRequests--; drain(); });
    }
  }

  // ---- Element scanner ----
  function processImage(img) {
    if (PROCESSING.has(img) || img.dataset.aiRadarBlocked) return;
    const url = img.currentSrc || img.src;
    if (!url || url.startsWith("data:") || url.length < 10) return;
    if (img.naturalWidth && img.naturalWidth < MIN_SIZE) return;

    // 1-qatlam: local filtr
    const local = localBlockDecision(img, url);
    if (local.block) { shieldElement(img, local.reason); return; }

    // 2-qatlam: AI (agar yoqilgan bo'lsa)
    if (aiDisabled) return;
    PROCESSING.add(img);
    enqueue(async () => {
      const { block, reason } = await analyzeImage(url);
      if (block) shieldElement(img, reason);
    });
  }

  function processVideo(video) {
    if (PROCESSING.has(video) || video.dataset.aiRadarBlocked) return;
    const url = video.poster || video.currentSrc || video.src || "";

    const local = localBlockDecision(video, url);
    if (local.block) { shieldElement(video, local.reason); return; }

    if (aiDisabled) return;
    if (!url || url.startsWith("blob:") || url.startsWith("data:")) {
      return tryCaptureFrame(video);
    }
    PROCESSING.add(video);
    enqueue(async () => {
      const { block, reason } = await analyzeImage(url);
      if (block) shieldElement(video, reason);
    });
  }

  function tryCaptureFrame(video) {
    if (video.readyState < 2) {
      video.addEventListener("loadeddata", () => tryCaptureFrame(video), { once: true });
      return;
    }
    PROCESSING.add(video);
    enqueue(async () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = Math.min(video.videoWidth, 384);
        canvas.height = Math.min(video.videoHeight, 384);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
        const base64 = dataUrl.split(",")[1];
        const res = await fetch(`${API_BASE}/analyze-image`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ANON_KEY}`, "apikey": ANON_KEY },
          body: JSON.stringify({ image_base64: base64, fast: true, language: "uz" }),
        });
        if (res.status === 402 || res.status === 429) { aiDisabled = true; return; }
        const data = await res.json();
        if (data.should_block) shieldElement(video, data.block_reason || "");
      } catch (e) { console.warn("[AI Radar] frame capture xatosi:", e); }
    });
  }

  // ---- Observers ----
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const el = entry.target;
      if (el.tagName === "IMG") processImage(el);
      else if (el.tagName === "VIDEO") processVideo(el);
      io.unobserve(el);
    }
  }, { rootMargin: "200px", threshold: 0.01 });

  function observeElement(el) {
    if (el.tagName === "IMG" || el.tagName === "VIDEO") io.observe(el);
  }

  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.tagName === "IMG" || node.tagName === "VIDEO") observeElement(node);
        node.querySelectorAll && node.querySelectorAll("img, video").forEach(observeElement);
      }
      if (m.type === "attributes" && (m.target.tagName === "IMG" || m.target.tagName === "VIDEO")) {
        delete m.target.dataset.aiRadarBlocked;
        PROCESSING.delete(m.target);
        observeElement(m.target);
      }
    }
  });
  mo.observe(document.documentElement, {
    childList: true, subtree: true,
    attributes: true, attributeFilter: ["src", "poster", "srcset"],
  });

  document.querySelectorAll("img, video").forEach(observeElement);
  console.log("%c[AI Radar v2] 🛡️ Doimiy kuzatuv yoqildi (local + AI)", "color:#10b981;font-weight:bold");
})();
