(() => {
  // Evita doble inyección si se hace click en "Capturar" varias veces.
  if (window.__stampmarkActive) return;
  window.__stampmarkActive = true;

  const overlay = document.createElement("div");
  overlay.id = "stampmark-overlay";

  const dimTop = mk("sm-dim");
  const dimBottom = mk("sm-dim");
  const dimLeft = mk("sm-dim");
  const dimRight = mk("sm-dim");
  const rect = mk("sm-rect");
  const hint = mk("sm-hint");
  hint.textContent = "Arrastra para recortar una estampa · Esc para cancelar";

  overlay.append(dimTop, dimBottom, dimLeft, dimRight, rect, hint);
  document.documentElement.appendChild(overlay);

  let startX = 0, startY = 0, curX = 0, curY = 0, dragging = false;

  function mk(cls) {
    const el = document.createElement("div");
    el.className = cls;
    return el;
  }

  function box() {
    const x = Math.min(startX, curX);
    const y = Math.min(startY, curY);
    const w = Math.abs(curX - startX);
    const h = Math.abs(curY - startY);
    return { x, y, w, h };
  }

  function drawSelection() {
    const { x, y, w, h } = box();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    rect.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;`;
    dimTop.style.cssText = `left:0;top:0;width:${vw}px;height:${y}px;`;
    dimBottom.style.cssText = `left:0;top:${y + h}px;width:${vw}px;height:${vh - (y + h)}px;`;
    dimLeft.style.cssText = `left:0;top:${y}px;width:${x}px;height:${h}px;`;
    dimRight.style.cssText = `left:${x + w}px;top:${y}px;width:${vw - (x + w)}px;height:${h}px;`;
  }

  function onMouseDown(e) {
    if (e.button !== 0) return;
    dragging = true;
    startX = curX = e.clientX;
    startY = curY = e.clientY;
    hint.style.display = "none";
    drawSelection();
  }

  function onMouseMove(e) {
    if (!dragging) return;
    curX = e.clientX;
    curY = e.clientY;
    drawSelection();
  }

  function onMouseUp() {
    if (!dragging) return;
    dragging = false;
    const sel = box();
    if (sel.w < 8 || sel.h < 8) {
      cleanup();
      return;
    }
    finish(sel);
  }

  function onKey(e) {
    if (e.key === "Escape") cleanup();
  }

  overlay.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mousemove", onMouseMove, true);
  window.addEventListener("mouseup", onMouseUp, true);
  window.addEventListener("keydown", onKey, true);

  function cleanup() {
    overlay.removeEventListener("mousedown", onMouseDown);
    window.removeEventListener("mousemove", onMouseMove, true);
    window.removeEventListener("mouseup", onMouseUp, true);
    window.removeEventListener("keydown", onKey, true);
    overlay.remove();
    window.__stampmarkActive = false;
  }

  async function finish(sel) {
    // Ocultamos el overlay para que NO salga en la captura del viewport.
    overlay.style.display = "none";

    // Esperamos dos frames para asegurar el repintado antes de capturar.
    await nextFrame();
    await nextFrame();

    let shot;
    try {
      const res = await chrome.runtime.sendMessage({ type: "CAPTURE_VISIBLE" });
      if (!res || res.error || !res.dataUrl) throw new Error(res && res.error);
      shot = res.dataUrl;
    } catch (err) {
      toast("No se pudo capturar 😕");
      cleanup();
      return;
    }

    try {
      const blob = await buildStamp(shot, sel);
      const dataUrl = await blobToDataUrl(blob);

      let copied = false;
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        copied = true;
      } catch (e) {
        // Puede fallar si se perdió el gesto del usuario; igual la guardamos.
        copied = false;
      }

      await chrome.runtime.sendMessage({
        type: "SAVE_STAMP",
        stamp: {
          dataUrl,
          url: location.href,
          title: document.title || location.hostname,
          favicon: faviconUrl(),
          width: blob.__w,
          height: blob.__h,
        },
      });

      toast(copied ? "Estampa copiada y guardada ✦" : "Estampa guardada en el moodboard ✦");
    } catch (err) {
      console.error("Stampmark:", err);
      toast("Algo salió mal al crear la estampa");
    }

    cleanup();
  }

  // Recorta el viewport, aplica la forma de estampa y le añade un borde blanco
  // que sigue la silueta dentada.
  async function buildStamp(shotDataUrl, sel) {
    const dpr = window.devicePixelRatio || 1;
    const sx = Math.round(sel.x * dpr);
    const sy = Math.round(sel.y * dpr);
    const sw = Math.round(sel.w * dpr);
    const sh = Math.round(sel.h * dpr);

    const shot = await loadImage(shotDataUrl);

    // Silueta blanca de la estampa, estirada al recorte (sirve de máscara y de borde).
    const maskUrl = await stampMaskUrl(sw, sh);
    const maskImg = await loadImage(maskUrl);

    // 1) Contenido: el recorte del viewport con la forma de estampa.
    const content = document.createElement("canvas");
    content.width = sw;
    content.height = sh;
    const cctx = content.getContext("2d");
    cctx.drawImage(shot, sx, sy, sw, sh, 0, 0, sw, sh);
    cctx.globalCompositeOperation = "destination-in";
    cctx.drawImage(maskImg, 0, 0, sw, sh);
    cctx.globalCompositeOperation = "source-over";

    // 2) Bordes que siguen la silueta: borde blanco + línea fina interior.
    const white = Math.max(4, Math.round(Math.min(sw, sh) * 0.033)); // grosor del borde blanco
    const line = Math.max(1, Math.round(white * 0.22) - 1);          // línea fina interior (1px más fina)
    const border = white + line;

    const lineImg = colorizeSilhouette(maskImg, sw, sh, "rgba(28, 25, 20, 0.55)");

    const out = document.createElement("canvas");
    out.width = sw + border * 2;
    out.height = sh + border * 2;
    const octx = out.getContext("2d");

    // Borde blanco (silueta dilatada `border`).
    dilate(octx, maskImg, border, border, sw, sh);
    octx.drawImage(maskImg, border, border, sw, sh);

    // Línea fina interior (silueta dilatada `line`, sobre el blanco).
    dilate(octx, lineImg, line, border, sw, sh);
    octx.drawImage(lineImg, border, border, sw, sh);

    // 3) Contenido encima, dejando visibles el reborde blanco y la línea.
    octx.drawImage(content, border, border);

    const blob = await new Promise((r) => out.toBlob(r, "image/png"));
    blob.__w = out.width;
    blob.__h = out.height;
    return blob;
  }

  // Lee el stamp.svg empaquetado, lo fuerza a estirarse (preserveAspectRatio=none)
  // y lo pinta blanco para usarlo como máscara alpha.
  let _maskTemplate = null;
  async function stampMaskUrl(w, h) {
    if (!_maskTemplate) {
      const svgText = await fetch(chrome.runtime.getURL("stamp.svg")).then((r) => r.text());
      const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
      const svg = doc.documentElement;
      svg.setAttribute("preserveAspectRatio", "none");
      svg.querySelectorAll("[fill]").forEach((el) => el.setAttribute("fill", "#ffffff"));
      _maskTemplate = svg;
    }
    const svg = _maskTemplate.cloneNode(true);
    svg.setAttribute("width", w);
    svg.setAttribute("height", h);
    const xml = new XMLSerializer().serializeToString(svg);
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
  }

  // Dilata una silueta estampándola en un anillo de radio `radius`,
  // centrada en el desplazamiento `base`.
  function dilate(ctx, img, radius, base, sw, sh) {
    const steps = 32;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      ctx.drawImage(img, base + Math.cos(a) * radius, base + Math.sin(a) * radius, sw, sh);
    }
  }

  // Devuelve un canvas con la silueta rellena del color dado.
  function colorizeSilhouette(img, w, h, color) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const x = c.getContext("2d");
    x.drawImage(img, 0, 0, w, h);
    x.globalCompositeOperation = "source-in";
    x.fillStyle = color;
    x.fillRect(0, 0, w, h);
    return c;
  }

  function faviconUrl() {
    const link = document.querySelector("link[rel~='icon']");
    if (link && link.href) return link.href;
    return location.origin + "/favicon.ico";
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.readAsDataURL(blob);
    });
  }

  function nextFrame() {
    return new Promise((r) => requestAnimationFrame(() => r()));
  }

  function toast(text) {
    let el = document.getElementById("stampmark-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "stampmark-toast";
      document.documentElement.appendChild(el);
    }
    el.textContent = text;
    requestAnimationFrame(() => el.classList.add("sm-show"));
    setTimeout(() => {
      el.classList.remove("sm-show");
      setTimeout(() => el.remove(), 300);
    }, 2200);
  }
})();
