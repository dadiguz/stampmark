const STORAGE_KEY = "stampmark.stamps";

async function refreshCount() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const stamps = data[STORAGE_KEY] || [];
  document.getElementById("count").textContent = String(stamps.length);
}

document.getElementById("capture").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  // No se puede inyectar en páginas internas de Chrome.
  if (/^(chrome|edge|about|chrome-extension):/i.test(tab.url || "")) {
    alert("No se puede capturar en páginas internas del navegador. Abre una página web normal.");
    return;
  }

  await chrome.runtime.sendMessage({ type: "START_CAPTURE", tabId: tab.id });
  window.close();
});

document.getElementById("moodboard").addEventListener("click", async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL("moodboard.html") });
  window.close();
});

refreshCount();
