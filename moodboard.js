const STORAGE_KEY = "stampmark.stamps";

// Tamaño uniforme para TODAS las estampas (proporción canónica de la estampa),
// 1/3 más pequeñas que antes.
const STAMP_W = 147;
const STAMP_H = Math.round(STAMP_W * 1280 / 996); // ≈ 189

const viewport = document.getElementById("viewport");
const canvas = document.getElementById("canvas");
const countEl = document.getElementById("count");
const emptyEl = document.getElementById("empty");

const view = { x: 0, y: 0, scale: 1 };
let stamps = [];
let localWrite = false; // para ignorar el onChanged disparado por nosotros mismos

function applyTransform() {
  canvas.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
}

async function load() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  stamps = data[STORAGE_KEY] || [];
  render();
}

async function persist() {
  localWrite = true;
  await chrome.storage.local.set({ [STORAGE_KEY]: stamps });
}

function render() {
  canvas.innerHTML = "";
  countEl.textContent = `${stamps.length} ${stamps.length === 1 ? "estampa" : "estampas"}`;
  emptyEl.style.display = stamps.length ? "none" : "flex";

  for (const s of stamps) {
    const el = document.createElement("div");
    el.className = "stamp";
    el.style.width = `${STAMP_W}px`;
    el.style.height = `${STAMP_H}px`;
    positionEl(el, s);

    const img = document.createElement("img");
    img.src = s.dataUrl;
    el.appendChild(img);

    const meta = document.createElement("div");
    meta.className = "meta";
    const fav = document.createElement("img");
    fav.src = s.favicon || "";
    fav.onerror = () => fav.remove();
    meta.appendChild(fav);
    meta.appendChild(document.createTextNode(hostOf(s.url)));
    el.appendChild(meta);

    const rot = document.createElement("button");
    rot.className = "rotate";
    rot.title = "Girar";
    rot.textContent = "⟳";
    el.appendChild(rot);

    const del = document.createElement("button");
    del.className = "del";
    del.textContent = "×";
    del.title = "Eliminar estampa";
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      removeStamp(s.id);
    });
    el.appendChild(del);

    wireInteractions(el, s, rot);
    canvas.appendChild(el);
  }
}

function positionEl(el, s) {
  el.style.left = `${s.x}px`;
  el.style.top = `${s.y}px`;
  el.style.transform = `rotate(${s.rotation || 0}deg)`;
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return url || "enlace"; }
}

async function removeStamp(id) {
  stamps = stamps.filter((s) => s.id !== id);
  await persist();
  render();
}

/* ---------- Interacción por estampa: mover / girar / abrir ---------- */
function wireInteractions(el, s, rotHandle) {
  // GIRAR: arrastrar el tirador.
  rotHandle.addEventListener("mousedown", (e) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const onMove = (ev) => {
      const angle = Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI + 90;
      s.rotation = Math.round(angle * 10) / 10;
      el.style.transform = `rotate(${s.rotation}deg)`;
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("mouseup", onUp, true);
      persist();
    };
    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("mouseup", onUp, true);
  });

  // MOVER: arrastrar la estampa. Si no se mueve, es click → abre el sitio.
  el.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    e.stopPropagation(); // no paneamos el lienzo cuando agarramos una estampa
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = s.x;
    const origY = s.y;
    let dragged = false;

    const onMove = (ev) => {
      const dx = (ev.clientX - startX) / view.scale;
      const dy = (ev.clientY - startY) / view.scale;
      if (!dragged && Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) > 4) {
        dragged = true;
        el.classList.add("dragging");
      }
      if (dragged) {
        s.x = origX + dx;
        s.y = origY + dy;
        el.style.left = `${s.x}px`;
        el.style.top = `${s.y}px`;
      }
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("mouseup", onUp, true);
      el.classList.remove("dragging");
      if (dragged) {
        persist();
      } else {
        chrome.tabs.create({ url: s.url });
      }
    };
    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("mouseup", onUp, true);
  });
}

/* ---------- Pan del lienzo (fondo vacío) ---------- */
let panning = false;
let panStart = null;

viewport.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  panning = true;
  panStart = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
  viewport.classList.add("panning");
});

window.addEventListener("mousemove", (e) => {
  if (!panning) return;
  view.x = panStart.vx + (e.clientX - panStart.x);
  view.y = panStart.vy + (e.clientY - panStart.y);
  applyTransform();
});

window.addEventListener("mouseup", () => {
  if (!panning) return;
  panning = false;
  viewport.classList.remove("panning");
});

/* ---------- Zoom del lienzo (no escala las estampas entre sí) ---------- */
viewport.addEventListener("wheel", (e) => {
  e.preventDefault();
  const rect = viewport.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  const delta = -e.deltaY * 0.0015;
  const newScale = clamp(view.scale * (1 + delta), 0.1, 4);

  const wx = (mx - view.x) / view.scale;
  const wy = (my - view.y) / view.scale;
  view.x = mx - wx * newScale;
  view.y = my - wy * newScale;
  view.scale = newScale;
  applyTransform();
}, { passive: false });

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

/* ---------- Encajar / centrar ---------- */
document.getElementById("reset").addEventListener("click", () => {
  view.x = 0; view.y = 0; view.scale = 1;
  applyTransform();
});

document.getElementById("fit").addEventListener("click", fitToContent);

function fitToContent() {
  if (!stamps.length) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of stamps) {
    minX = Math.min(minX, s.x);
    minY = Math.min(minY, s.y);
    maxX = Math.max(maxX, s.x + STAMP_W);
    maxY = Math.max(maxY, s.y + STAMP_H);
  }
  const pad = 80;
  const cw = maxX - minX + pad * 2;
  const ch = maxY - minY + pad * 2;
  const scale = clamp(Math.min(viewport.clientWidth / cw, viewport.clientHeight / ch), 0.1, 2);
  view.scale = scale;
  view.x = (viewport.clientWidth - cw * scale) / 2 - (minX - pad) * scale;
  view.y = (viewport.clientHeight - ch * scale) / 2 - (minY - pad) * scale;
  applyTransform();
}

/* ---------- Sincronización en vivo (estampas nuevas desde otra pestaña) ---------- */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[STORAGE_KEY]) return;
  if (localWrite) { localWrite = false; return; } // ignoramos nuestros propios cambios
  stamps = changes[STORAGE_KEY].newValue || [];
  render();
});

applyTransform();
load();
