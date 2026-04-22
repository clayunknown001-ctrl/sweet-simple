/**
 * AI Radar — Content Script
 * Har qanday saytda ishga tushadi (document_start).
 * Rasm va videolarni avtomatik kuzatadi va zararli kontentni bloklaydi.
 */
(function () {
  "use strict";
  if (window.__AI_RADAR_LOADED__) return;
  window.__AI_RADAR_LOADED__ = true;

  const API_BASE = "https://iwyntbeqdvsbzvmskpaw.supabase.co/functions/v1";
  const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3eW50YmVxZHZzYnp2bXNrcGF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0NDkyOTYsImV4cCI6MjA4ODAyNTI5Nn0.dwvan4-1Mifxo6r3WzFqxmdMiByJ63h1Jk4rkvUrc0g";

  const MIN_SIZE = 80;
  const MAX_CONCURRENT = 4;
  const CACHE = new Map();
  const PROCESSING = new WeakSet();
  const QUEUE = [];
  let active = 0;
  let blockedCount = 0;

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
    shield.innerHTML =
      '<div class="icon">🛡️</div>' +
      '<div class="title">Bloklandi</div>' +
      '<div class="reason"></div>';
    shield.querySelector(".reason").textContent = (reason || "Zararli kontent").slice(0, 100);
    const r = el.getBoundingClientRect();
    shield.style.width = (r.width || el.offsetWidth || 200) + "px";
    shield.style.height = (r.height || el.offsetHeight || 200) + "px";
    el.insertAdjacentElement("afterend", shield);
  }

  // --- AI request ---
  async function analyzeUrl(url) {
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
      const result = { block: !!data.should_block, reason: data.block_reason || data.category || "" };
      CACHE.set(url, result);
      return result;
    } catch (e) {
      return { block: false, reason: "" };
    }
  }

  async function analyzeBase64(base64) {
    try {
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
      return { block: !!data.should_block, reason: data.block_reason || data.category || "" };
    } catch {
      return { block: false, reason: "" };
    }
  }

  // --- queue ---
  function enqueue(task) {
    QUEUE.push(task);
    drain();
  }
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
        const b64 = c.toDataURL("image/jpeg", 0.7).split(",")[1];
        const { block, reason } = await analyzeBase64(b64);
        if (block) shieldElement(video, reason);
      } catch {}
    });
  }

  // --- IntersectionObserver: faqat ekrandagi elementlarni tahlil ---
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

  // --- MutationObserver: scroll/yangi elementlar ---
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
    console.log("%c[AI Radar] 🛡️ Faol — har bir rasm/video kuzatilmoqda", "color:#10b981;font-weight:bold");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
