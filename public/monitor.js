/**
 * AI Radar — Real-Time Browser Content Monitor
 * ================================================
 * Bu skript brauzerda har bir sahifadagi rasm va videolarni
 * avtomatik kuzatadi (yo'l radari kabi). Behayo/zararli kontent
 * topilsa — darhol bloklaydi.
 *
 * Brauzer extension uchun: manifest.json da `content_scripts` ga qo'shing:
 *   {
 *     "matches": ["<all_urls>"],
 *     "js": ["monitor.js"],
 *     "run_at": "document_idle"
 *   }
 *
 * Yoki har qanday saytga DevTools Console orqali yuklab sinash mumkin.
 */

(function () {
  "use strict";

  const API_BASE = "https://iwyntbeqdvsbzvmskpaw.supabase.co/functions/v1";
  const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3eW50YmVxZHZzYnp2bXNrcGF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0NDkyOTYsImV4cCI6MjA4ODAyNTI5Nn0.dwvan4-1Mifxo6r3WzFqxmdMiByJ63h1Jk4rkvUrc0g";

  // Sozlamalar
  const MIN_SIZE = 100;             // 100x100 dan kichik rasmlar e'tiborsiz
  const MAX_CONCURRENT = 3;         // Bir vaqtda max 3 ta tahlil
  const CACHE = new Map();          // URL -> {block, reason} (qayta tahlil qilmaslik)
  const PROCESSING = new WeakSet(); // Element-level dedup
  const QUEUE = [];
  let activeRequests = 0;

  // ---- 1. UI: bloklangan element o'rniga ko'rsatiladigan overlay ----
  const style = document.createElement("style");
  style.textContent = `
    .ai-radar-blocked {
      position: relative !important;
      filter: blur(40px) grayscale(1) !important;
      pointer-events: none !important;
      transition: filter 0.15s ease !important;
    }
    .ai-radar-shield {
      position: absolute;
      inset: 0;
      background: rgba(15, 23, 42, 0.92);
      color: #fff;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 13px;
      text-align: center;
      padding: 12px;
      z-index: 999999;
      border: 2px solid #ef4444;
      border-radius: 8px;
      pointer-events: auto;
    }
    .ai-radar-shield .icon { font-size: 28px; margin-bottom: 6px; }
    .ai-radar-shield .title { font-weight: 700; color: #fca5a5; margin-bottom: 4px; }
    .ai-radar-shield .reason { opacity: 0.85; font-size: 11px; }
  `;
  document.documentElement.appendChild(style);

  function shieldElement(el, reason) {
    if (el.dataset.aiRadarBlocked) return;
    el.dataset.aiRadarBlocked = "1";
    el.classList.add("ai-radar-blocked");

    // Video — to'xtatish va ovozni o'chirish
    if (el.tagName === "VIDEO") {
      try { el.pause(); el.muted = true; el.removeAttribute("autoplay"); } catch {}
    }

    // Overlay shield qo'shish (parent relative bo'lsa)
    const parent = el.parentElement;
    if (parent && getComputedStyle(parent).position === "static") {
      parent.style.position = "relative";
    }
    const shield = document.createElement("div");
    shield.className = "ai-radar-shield";
    shield.innerHTML = `
      <div class="icon">🛡️</div>
      <div class="title">Bloklangan</div>
      <div class="reason">${(reason || "Zararli kontent").slice(0, 80)}</div>
    `;
    // Element o'lchamida joylashtirish
    const rect = el.getBoundingClientRect();
    shield.style.width = rect.width + "px";
    shield.style.height = rect.height + "px";
    el.insertAdjacentElement("afterend", shield);
  }

  // ---- 2. AI tahlil chaqiruvi (FAST mode) ----
  async function analyzeImage(url) {
    if (CACHE.has(url)) return CACHE.get(url);
    try {
      const res = await fetch(`${API_BASE}/analyze-image`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${ANON_KEY}`,
          "apikey": ANON_KEY,
        },
        body: JSON.stringify({ image_url: url, fast: true, language: "uz" }),
      });
      const data = await res.json();
      const result = {
        block: !!data.should_block,
        reason: data.block_reason || data.category || "",
      };
      CACHE.set(url, result);
      return result;
    } catch (e) {
      console.warn("[AI Radar] tahlil xatosi:", e);
      return { block: false, reason: "" };
    }
  }

  // ---- 3. Queue manager — parallel limit bilan ----
  function enqueue(task) {
    QUEUE.push(task);
    drain();
  }
  async function drain() {
    while (activeRequests < MAX_CONCURRENT && QUEUE.length > 0) {
      const task = QUEUE.shift();
      activeRequests++;
      task().finally(() => {
        activeRequests--;
        drain();
      });
    }
  }

  // ---- 4. Element scanner ----
  function processImage(img) {
    if (PROCESSING.has(img) || img.dataset.aiRadarBlocked) return;
    const url = img.currentSrc || img.src;
    if (!url || url.startsWith("data:") || url.length < 10) return;
    if (img.naturalWidth && img.naturalWidth < MIN_SIZE) return;
    PROCESSING.add(img);

    enqueue(async () => {
      const { block, reason } = await analyzeImage(url);
      if (block) shieldElement(img, reason);
    });
  }

  function processVideo(video) {
    if (PROCESSING.has(video) || video.dataset.aiRadarBlocked) return;
    // Video dan poster (thumbnail) ni tahlil qilamiz — tez va arzon
    const url = video.poster || video.currentSrc || video.src;
    if (!url || url.startsWith("blob:") || url.startsWith("data:")) {
      // Blob/stream video — frame capture orqali
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
        canvas.width = Math.min(video.videoWidth, 512);
        canvas.height = Math.min(video.videoHeight, 512);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        const base64 = dataUrl.split(",")[1];
        const res = await fetch(`${API_BASE}/analyze-image`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${ANON_KEY}`,
            "apikey": ANON_KEY,
          },
          body: JSON.stringify({ image_base64: base64, fast: true, language: "uz" }),
        });
        const data = await res.json();
        if (data.should_block) shieldElement(video, data.block_reason || "");
      } catch (e) {
        console.warn("[AI Radar] frame capture xatosi:", e);
      }
    });
  }

  // ---- 5. IntersectionObserver — faqat ekranga kirgan elementlarni tahlil ----
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target;
        if (el.tagName === "IMG") processImage(el);
        else if (el.tagName === "VIDEO") processVideo(el);
        io.unobserve(el);
      }
    },
    { rootMargin: "200px", threshold: 0.01 }
  );

  function observeElement(el) {
    if (el.tagName === "IMG" || el.tagName === "VIDEO") io.observe(el);
  }

  // ---- 6. MutationObserver — yangi qo'shilgan element/scrollda ham ishlaydi ----
  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.tagName === "IMG" || node.tagName === "VIDEO") observeElement(node);
        node.querySelectorAll && node.querySelectorAll("img, video").forEach(observeElement);
      }
      // src o'zgargan bo'lsa (lazy load)
      if (m.type === "attributes" && m.target.tagName === "IMG") {
        delete m.target.dataset.aiRadarBlocked;
        PROCESSING.delete(m.target);
        observeElement(m.target);
      }
    }
  });
  mo.observe(document.documentElement, {
    childList: true, subtree: true,
    attributes: true, attributeFilter: ["src", "poster"],
  });

  // ---- 7. Boshlang'ich skan ----
  document.querySelectorAll("img, video").forEach(observeElement);

  console.log("%c[AI Radar] 🛡️ Doimiy kuzatuv yoqildi", "color:#10b981;font-weight:bold");
})();
