/**
 * NSFW Local Model Loader (TensorFlow.js + NSFWJS)
 * Page-context'ga inject qilinadi (content script CSP'ga tushmaslik uchun).
 * Model bir marta yuklanadi (~5MB), keyin browser cache'da qoladi.
 */
(function () {
  if (window.__AI_RADAR_NSFW__) return;
  window.__AI_RADAR_NSFW__ = { ready: false, model: null, loading: false };

  const TFJS_URL = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.min.js";
  const NSFWJS_URL = "https://cdn.jsdelivr.net/npm/nsfwjs@2.4.2/dist/nsfwjs.min.js";

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Failed to load " + src));
      (document.head || document.documentElement).appendChild(s);
    });
  }

  async function loadModel() {
    if (window.__AI_RADAR_NSFW__.ready) return window.__AI_RADAR_NSFW__.model;
    if (window.__AI_RADAR_NSFW__.loading) {
      while (window.__AI_RADAR_NSFW__.loading) await new Promise((r) => setTimeout(r, 100));
      return window.__AI_RADAR_NSFW__.model;
    }
    window.__AI_RADAR_NSFW__.loading = true;
    try {
      if (!window.tf) await loadScript(TFJS_URL);
      if (!window.nsfwjs) await loadScript(NSFWJS_URL);
      // MobileNetV2, ~4.2MB
      const model = await window.nsfwjs.load("https://cdn.jsdelivr.net/npm/nsfwjs@2.4.2/example/nsfw_demo/models/mobilenet_v2/");
      window.__AI_RADAR_NSFW__.model = model;
      window.__AI_RADAR_NSFW__.ready = true;
      window.dispatchEvent(new CustomEvent("ai-radar-nsfw-ready"));
      console.log("[AI Radar] NSFW lokal model tayyor");
    } catch (e) {
      console.warn("[AI Radar] NSFW model yuklab bo'lmadi:", e?.message);
    } finally {
      window.__AI_RADAR_NSFW__.loading = false;
    }
    return window.__AI_RADAR_NSFW__.model;
  }

  // Bridge: content.js postMessage orqali so'raydi
  window.addEventListener("message", async (ev) => {
    if (!ev.data || ev.source !== window) return;
    const msg = ev.data;
    if (msg.__aiRadar !== "classify") return;
    const { id, src } = msg;
    try {
      const model = await loadModel();
      if (!model) {
        window.postMessage({ __aiRadar: "result", id, error: "no-model" }, "*");
        return;
      }
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.referrerPolicy = "no-referrer";
      const loaded = await new Promise((resolve) => {
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = src;
        setTimeout(() => resolve(false), 5000);
      });
      if (!loaded || !img.naturalWidth) {
        window.postMessage({ __aiRadar: "result", id, error: "load-failed" }, "*");
        return;
      }
      const preds = await model.classify(img);
      const out = {};
      for (const p of preds) out[p.className] = p.probability;
      window.postMessage({ __aiRadar: "result", id, preds: out }, "*");
    } catch (e) {
      window.postMessage({ __aiRadar: "result", id, error: String(e?.message || e) }, "*");
    }
  });

  // Boshlanishida modelni preload (faqat ishchi sahifalarda)
  setTimeout(() => loadModel().catch(() => {}), 2000);
})();
