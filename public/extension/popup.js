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
  ["totalBlocked", "localBlocked", "cloudBlocked", "localApproved", "lastBlock", "paused"],
  render
);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  chrome.storage.local.get(
    ["totalBlocked", "localBlocked", "cloudBlocked", "localApproved", "lastBlock", "paused"],
    render
  );
});

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
