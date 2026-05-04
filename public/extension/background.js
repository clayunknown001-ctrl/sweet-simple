// AI Radar — Background Service Worker
// Maqsadi: CORS to'siqlarini chetlab o'tib, rasmlarni baytma-bayt yuklab,
// content script'ga base64 ko'rinishida qaytarish. Shu orqali Pinterest,
// Instagram va boshqa CORS-himoyalangan saytlarda lokal NSFW model ishlaydi.

const CACHE = new Map(); // url -> { dataUrl, ts }
const MAX_CACHE = 200;
const TTL = 10 * 60 * 1000;

function trimCache() {
  if (CACHE.size <= MAX_CACHE) return;
  const entries = [...CACHE.entries()].sort((a, b) => a[1].ts - b[1].ts);
  for (let i = 0; i < entries.length - MAX_CACHE; i++) CACHE.delete(entries[i][0]);
}

async function fetchAsDataUrl(url) {
  const cached = CACHE.get(url);
  if (cached && Date.now() - cached.ts < TTL) return cached.dataUrl;
  const res = await fetch(url, { credentials: "omit", referrerPolicy: "no-referrer", mode: "cors" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const ct = res.headers.get("content-type") || "image/jpeg";
  const buf = new Uint8Array(await res.arrayBuffer());
  // Limit ~5MB
  if (buf.length > 5_000_000) throw new Error("too-large");
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  const dataUrl = `data:${ct};base64,${btoa(bin)}`;
  CACHE.set(url, { dataUrl, ts: Date.now() });
  trimCache();
  return dataUrl;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "fetch-image") {
    fetchAsDataUrl(msg.url)
      .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true; // async
  }
  if (msg?.type === "blocked") {
    // count is already persisted by content.js — nothing else to do here
    return false;
  }
});
