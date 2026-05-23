/**
 * SafeNet Engine - lokal NSFW klassifikator (TF.js + NSFWJS)
 * window.classifyImage(imgElement) -> { Porn, Hentai, Sexy, Neutral, Drawing }
 */
window.__SAFENET_BASE__ = "/";

(function () {
  if (window.__AI_RADAR_NSFW__) return;

  class SafeCache {
    constructor(limit = 100) {
      this.limit = limit;
      this.cache = new Map();
    }
    set(key, val) {
      if (this.cache.size >= this.limit) this.cache.delete(this.cache.keys().next().value);
      this.cache.set(key, val);
    }
    get(key) {
      return this.cache.get(key);
    }
    has(key) {
      return this.cache.has(key);
    }
  }

  window.__AI_RADAR_NSFW__ = {
    ready: false,
    loading: false,
    model: null,
    cache: new SafeCache(100),
  };

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Failed to load " + src));
      document.head.appendChild(s);
    });
  }

  async function loadEngine() {
    const state = window.__AI_RADAR_NSFW__;
    if (state.ready) return state.model;
    if (state.loading) {
      while (state.loading) await new Promise((r) => setTimeout(r, 100));
      return state.model;
    }
    state.loading = true;
    try {
      if (!window.tf) await loadScript("/vendor/tf.min.js");
      if (!window.nsfwjs) await loadScript("/vendor/nsfwjs.min.js");
      const model = await window.nsfwjs.load("/vendor/nsfw-model/", { size: 224 });
      state.model = model;
      state.ready = true;
      window.dispatchEvent(new CustomEvent("safenet-ready"));
      console.log("[SafeNet] Engine ready");
    } catch (e) {
      console.warn("[SafeNet] Load failed:", e?.message || e);
    } finally {
      state.loading = false;
    }
    return state.model;
  }

  window.loadSafeNet = loadEngine;

  window.classifyImage = async (imgElement) => {
    if (!imgElement) throw new Error("imgElement required");
    if (!window.__AI_RADAR_NSFW__.ready) await loadEngine();
    const model = window.__AI_RADAR_NSFW__.model;
    if (!model) throw new Error("SafeNet model not available");

    const src = imgElement.src || "";
    const cache = window.__AI_RADAR_NSFW__.cache;
    if (src && cache.has(src)) return cache.get(src);

    // Rasm to'liq yuklanishini kutamiz
    if (!imgElement.complete || !imgElement.naturalWidth) {
      await new Promise((resolve) => {
        const done = () => resolve();
        imgElement.addEventListener("load", done, { once: true });
        imgElement.addEventListener("error", done, { once: true });
        setTimeout(done, 6000);
      });
    }

    const preds = await model.classify(imgElement);
    const out = {};
    preds.forEach((p) => (out[p.className] = p.probability));
    if (src) cache.set(src, out);
    return out;
  };

  window.classifyImageUrl = async (url) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("Image load failed: " + url));
      img.src = url;
      setTimeout(() => reject(new Error("Image load timeout")), 8000);
    });
    return window.classifyImage(img);
  };

  // Auto-boot
  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(loadEngine, 500);
  } else {
    window.addEventListener("DOMContentLoaded", () => setTimeout(loadEngine, 500));
  }
})();
