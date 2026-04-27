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
