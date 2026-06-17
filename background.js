const STORAGE_KEY = "stampmark.stamps";

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "START_CAPTURE") {
    startCapture(msg.tabId);
    return false;
  }

  if (msg.type === "CAPTURE_VISIBLE") {
    // Capturamos el viewport visible de la ventana de la pestaña que pide.
    const windowId = sender.tab ? sender.tab.windowId : chrome.windows.WINDOW_ID_CURRENT;
    chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ dataUrl });
      }
    });
    return true; // respuesta asíncrona
  }

  if (msg.type === "SAVE_STAMP") {
    saveStamp(msg.stamp).then((saved) => sendResponse({ ok: true, stamp: saved }));
    return true;
  }

  return false;
});

async function startCapture(tabId) {
  try {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ["selector.css"] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ["selector.js"] });
  } catch (e) {
    console.error("Stampmark: no se pudo iniciar la captura", e);
  }
}

async function saveStamp(stamp) {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const stamps = data[STORAGE_KEY] || [];

  const placed = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...stamp,
    ...computePosition(stamps.length),
    createdAt: Date.now(),
  };

  stamps.push(placed);
  await chrome.storage.local.set({ [STORAGE_KEY]: stamps });
  return placed;
}

// Colocación automática: rejilla limpia, siempre rectas (0° de inclinación).
function computePosition(index) {
  const cols = 5;
  const cellW = 190;
  const cellH = 240;
  const col = index % cols;
  const row = Math.floor(index / cols);
  return {
    x: col * cellW,
    y: row * cellH,
    rotation: 0,
  };
}
