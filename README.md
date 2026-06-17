# Stampmark

Extensión de Chrome (Manifest V3) para recortar cualquier parte del navegador con **forma de estampa**, copiarla al portapapeles y guardarla en un **moodboard de canvas infinito**.

## Cómo funciona

1. **Capturar**: el popup inyecta un overlay; arrastras para seleccionar un área.
2. Se captura el viewport (`captureVisibleTab`), se recorta a la selección (ajustando `devicePixelRatio`) y se aplica `stamp.svg` como **máscara alpha** → PNG con los bordes dentados transparentes.
3. La imagen se **copia al portapapeles** y se **guarda** junto con la URL y el título de la página.
4. El **moodboard** coloca las estampas automáticamente; arrastra para mover, rueda para zoom, y **click en una estampa abre el sitio de origen**.

## Instalar (modo desarrollador)

1. Abre `chrome://extensions`.
2. Activa **Modo de desarrollador** (arriba a la derecha).
3. **Cargar descomprimida** → selecciona la carpeta `stampmark`.
4. Fija el icono y úsalo en cualquier página web normal (no funciona en páginas `chrome://`).

## Archivos

| Archivo | Rol |
|---|---|
| `manifest.json` | Configuración MV3 |
| `popup.html/.js` | Botones Capturar / Moodboard |
| `background.js` | Service worker: inyección, captura, almacenamiento |
| `selector.js/.css` | Overlay de selección + recorte + máscara + portapapeles |
| `moodboard.html/.css/.js` | Canvas infinito (pan/zoom/click) |
| `stamp.svg` | Silueta de la estampa usada como máscara |

## Notas

- El almacenamiento usa `chrome.storage.local` con `unlimitedStorage`.
- La silueta se **estira** a la proporción de la selección (`preserveAspectRatio="none"`).
- Si el portapapeles falla (gesto de usuario perdido), la estampa igual se guarda en el moodboard.
