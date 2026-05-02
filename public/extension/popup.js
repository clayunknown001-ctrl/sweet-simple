// AI Radar popup — stats, last block, pause toggle
const $ = (id) => document.getElementById(id);

function render(state) {
  const blocked = state.totalBlocked || 0;
  const local = state.localBlocked || 0;
  const cloud = state.cloudBlocked || 0;
  const localApproved = state.localApproved || 0;
  $("blocked").textContent = blocked;
  $("local").textContent = local;
  $("cloud").textContent = cloud;
  // Har bir lokal qaror taxminan 0.001 kredit tejaydi (cloud chaqiruvi o'rniga)
  const saved = ((local + localApproved) * 0.001).toFixed(3);
  $("saved").textContent = `~${saved}`;

  if (state.lastBlock) {
    const { reason, host, ts } = state.lastBlock;
    const ago = ts ? Math.max(1, Math.round((Date.now() - ts) / 1000)) : 0;
    $("lastBlock").innerHTML = `<b>So'nggi blok</b> (${ago}s oldin)<br>${escapeHtml(host || "")} — ${escapeHtml(reason || "no reason")}`;
  }

  const paused = !!state.paused;
  $("statusBox").classList.toggle("paused", paused);
  $("statusText").textContent = paused ? "Vaqtincha to'xtatilgan" : "Doimiy kuzatuvda";
  const btn = $("toggleBtn");
  btn.classList.toggle("paused", paused);
  btn.textContent = paused ? "▶ Davom ettirish" : "⏸ Vaqtincha to'xtatish";
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]));
}

chrome.storage.local.get(
  ["totalBlocked", "localBlocked", "cloudBlocked", "localApproved", "lastBlock", "paused", "dailyBlocks"],
  (s) => { render(s); renderSpark(s.dailyBlocks || {}); }
);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  chrome.storage.local.get(
    ["totalBlocked", "localBlocked", "cloudBlocked", "localApproved", "lastBlock", "paused", "dailyBlocks"],
    (s) => { render(s); renderSpark(s.dailyBlocks || {}); }
  );
});

function renderSpark(db) {
  const svg = document.getElementById("spark");
  if (!svg) return;
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    days.push({ d, n: db[d] || 0 });
  }
  const total = days.reduce((a, b) => a + b.n, 0);
  const wt = document.getElementById("weekTotal");
  if (wt) wt.textContent = `${total} blok`;
  const max = Math.max(1, ...days.map((x) => x.n));
  const W = 268, H = 40, pad = 4, bw = (W - pad * 2) / days.length;
  let bars = "";
  days.forEach((x, i) => {
    const h = Math.max(2, ((H - pad * 2) * x.n) / max);
    const bx = pad + i * bw + 2;
    const by = H - pad - h;
    bars += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${(bw - 4).toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${x.n > 0 ? "#4ade80" : "rgba(255,255,255,0.1)"}" opacity="${x.n > 0 ? 0.9 : 0.5}"/>`;
  });
  svg.innerHTML = bars;
}

$("toggleBtn").addEventListener("click", () => {
  chrome.storage.local.get(["paused"], ({ paused }) => {
    chrome.storage.local.set({ paused: !paused });
  });
});

// === Whitelist boshqaruv ===
function renderWhitelist(list) {
  const el = $("wlList");
  if (!el) return;
  if (!list || !list.length) {
    el.innerHTML = '<div style="color:#64748b;font-size:11px;padding:4px;">Hali domen qo\'shilmagan.</div>';
    return;
  }
  el.innerHTML = list
    .map((d, i) => `<div class="wl-item"><span>${escapeHtml(d)}</span><button data-i="${i}" title="O'chirish">×</button></div>`)
    .join("");
  el.querySelectorAll("button[data-i]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = +btn.getAttribute("data-i");
      chrome.storage.local.get(["userWhitelist"], (s) => {
        const arr = Array.isArray(s.userWhitelist) ? s.userWhitelist.slice() : [];
        arr.splice(i, 1);
        chrome.storage.local.set({ userWhitelist: arr });
      });
    });
  });
}

function normDomain(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split(":")[0];
}

const wlAdd = $("wlAdd");
const wlInput = $("wlInput");
if (wlAdd && wlInput) {
  const add = () => {
    const v = normDomain(wlInput.value);
    if (!v || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(v)) return;
    chrome.storage.local.get(["userWhitelist"], (s) => {
      const arr = Array.isArray(s.userWhitelist) ? s.userWhitelist.slice() : [];
      if (!arr.includes(v)) arr.push(v);
      chrome.storage.local.set({ userWhitelist: arr });
      wlInput.value = "";
    });
  };
  wlAdd.addEventListener("click", add);
  wlInput.addEventListener("keydown", (e) => { if (e.key === "Enter") add(); });
}

chrome.storage.local.get(["userWhitelist"], (s) => renderWhitelist(s.userWhitelist || []));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.userWhitelist) {
    renderWhitelist(changes.userWhitelist.newValue || []);
  }
});
