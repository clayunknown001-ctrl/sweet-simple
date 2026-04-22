chrome.storage.local.get(["totalBlocked"], (r) => {
  document.getElementById("blocked").textContent = r.totalBlocked || 0;
});
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "blocked") {
    document.getElementById("blocked").textContent = msg.count;
  }
});
