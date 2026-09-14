// Tiny DOM helpers — no framework.
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v);
  }
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null || c === false) return;
    node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  });
  return node;
}
export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

// Build a .data-table and stamp each <td> with data-label from its column header
// so the CSS can reflow rows into stacked cards on narrow screens. Cells may be:
//   - a string/number/node  -> wrapped in a plain <td>
//   - { v, c }              -> <td class=c> with content v (empty v => empty td)
//   - an existing <td> node -> used as-is
// Empty cells get no children so `td:empty` can hide them in the stacked layout.
export function dataTable(headers, rows) {
  const table = el('table', { class: 'data-table' });
  table.appendChild(el('tr', { class: 'data-head' }, headers.map((h) => el('th', {}, h))));
  rows.forEach((cells) => {
    const tr = el('tr', {});
    cells.forEach((cell, i) => {
      let td;
      if (cell && cell.tagName === 'TD') {
        td = cell;
      } else if (cell && typeof cell === 'object' && !(cell instanceof Node)) {
        const v = cell.v;
        td = el('td', { class: cell.c || null }, v == null || v === '' || v === false ? [] : v);
      } else {
        td = el('td', {}, cell == null || cell === '' || cell === false ? [] : cell);
      }
      const label = headers[i];
      if (label) td.dataset.label = label;
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });
  return table;
}

// Decorative <img> (game mark / origin icon). alt is intentionally empty so a
// failed external image shows the browser's broken-image indicator rather than
// falling back to alt text (which would leak e.g. the mark code "RBY").
//
// Cloudflare (in front of archives.bulbagarden.net) returns 403 when too many
// images are requested at once — a box page mounts dozens of marks, which trips
// it. We defend on two fronts:
//   1. A small concurrency gate (MAX_CONCURRENT below) so we never fire the
//      burst that triggers the 403 in the first place.
//   2. crossorigin on the Bulbagarden host so the response is a real CORS
//      response (visible status), not an opaque one. That matters because the
//      service worker can only avoid caching a 403 if it can *see* it's a 403 —
//      opaque responses report status 0, indistinguishable from a good image,
//      so a single 403 used to get cached and replayed forever.
// On error we still retry the same URL a few times with backoff; now that 403s
// aren't cached, those retries actually reach the network. Only after exhausting
// retries do we mark it `.broken`.
const MAX_CONCURRENT = 6;
let active = 0;
const waiting = [];
function pumpImages() {
  while (active < MAX_CONCURRENT && waiting.length) {
    active++;
    waiting.shift()();
  }
}

// `fallbackSrc`, if given, is tried once `src` exhausts its retries — e.g. a
// Pokémon form sprite that doesn't exist falling back to the base species'.
// Only after the fallback also fails does the image get marked `.broken`.
export function icon(src, className, title, retries = 3, fallbackSrc = null) {
  // Bulbagarden sends `Access-Control-Allow-Origin: *`, so we can load it in CORS
  // mode for visible statuses. Serebii has no CORS header — requesting it with
  // crossorigin would fail outright, so it stays a plain (opaque) image.
  const cors = /(^|\.)archives\.bulbagarden\.net$/i.test(hostOf(src));
  // NB: no loading="lazy" here — a deferred lazy image fires neither load nor
  // error, which would hold a concurrency slot forever and stall the whole queue.
  // The gate below is what limits the burst instead.
  const img = el('img', {
    class: className, alt: '', title: title || null,
    decoding: 'async',
    crossorigin: cors ? 'anonymous' : null,
  });
  // Hidden until it actually loads, so the browser's native "broken image"
  // glyph never flashes while queued or mid-retry — only a real failure
  // (via .broken, below) leaves it hidden for good.
  img.style.visibility = 'hidden';

  let attempt = 0;
  let usingFallback = false;
  let settled = false;
  const release = () => { if (settled) return; settled = true; active = Math.max(0, active - 1); pumpImages(); };
  const currentSrc = () => (usingFallback ? fallbackSrc : src);
  img.addEventListener('load', () => { img.style.visibility = ''; release(); });
  img.addEventListener('error', () => {
    if (attempt++ < retries) {
      setTimeout(() => { img.removeAttribute('src'); img.src = currentSrc(); }, 600 * attempt);
    } else if (fallbackSrc && !usingFallback && fallbackSrc !== src) {
      usingFallback = true;
      attempt = 0;
      img.removeAttribute('src');
      img.src = currentSrc();
    } else {
      img.classList.add('broken');
      release(); // free the slot even when it never loads, so the queue drains
    }
  });

  waiting.push(() => { img.src = currentSrc(); });
  pumpImages();
  return img;
}

function hostOf(url) {
  try { return new URL(url, location.href).hostname; } catch { return ''; }
}

// Icon composite for a pick tile (`.tool-pick-box`): 1 image fills the square as
// today; 2 images split it into left/right halves (Challenges' existing paired-
// release convention, e.g. Scarlet & Violet); 5 images divide it into 5 pie-slice
// wedges sharing the square's center point, in the order given. Any other count
// isn't supported yet — falls back to just the first image.
// A slice only has to cover its own wedge, not the whole square — and a
// wedge's own vertices sit much closer to its centroid than the square's
// corners do to the square's center. For 5 equal-angle slices the farthest
// any wedge vertex gets from that wedge's own centroid is ~36.3% (x) / ~35%
// (y), so the image only needs to be ~72.6% of the box to pan that far
// without a gap; 80% leaves a small safety margin above that minimum.
const PENTA_ZOOM = 80;

// Reference-data JSON stores either a full external URL or a path relative to
// the app's own public/ (e.g. "tools/gen4/palpark/palpark-map.png") — resolve
// the latter against BASE_URL ('/' in dev, '/<repo>/' on GitHub Pages).
export function assetUrl(path) {
  if (!path) return '';
  return /^https?:\/\//i.test(path) ? path : import.meta.env.BASE_URL + path;
}

export function pickIcon(icons, title, imgClass = 'tool-pick-img') {
  const list = Array.isArray(icons) ? icons : [icons];
  const box = el('span', { class: 'tool-pick-box' });
  if (list.length === 2) {
    box.classList.add('dual');
    box.appendChild(el('span', { class: 'dual-half' }, [icon(list[0], imgClass, title)]));
    box.appendChild(el('span', { class: 'dual-half' }, [icon(list[1], imgClass, title)]));
  } else if (list.length === 5) {
    box.classList.add('penta');
    list.forEach((src, i) => {
      const points = pentaSlicePoints(i);
      const clip = `polygon(${points.map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(', ')})`;
      const slice = el('span', { class: 'penta-slice', style: `clip-path: ${clip}` });
      // Recenter this slice's own image on the wedge's centroid rather than the
      // square's shared center point — otherwise every slice would show only the
      // sliver of its image nearest that one shared corner, cropping out
      // whatever the image actually depicts. The image is oversized by PENTA_ZOOM
      // (with a small safety margin beyond the minimum needed for 5 equal
      // slices) so panning it to any wedge's centroid never exposes empty
      // space at its edges.
      const [cx, cy] = polygonCentroid(points);
      const im = icon(src, imgClass, title);
      const half = PENTA_ZOOM / 2;
      im.style.width = `${PENTA_ZOOM}%`;
      im.style.height = `${PENTA_ZOOM}%`;
      im.style.left = `${(cx - half).toFixed(2)}%`;
      im.style.top = `${(cy - half).toFixed(2)}%`;
      slice.appendChild(im);
      box.appendChild(slice);
    });
  } else {
    box.appendChild(icon(list[0], imgClass, title));
  }
  return box;
}

// A point on a square's own boundary (0-100 in each axis) reached by a ray from
// its center at `angleDeg`, using the conic-gradient convention (0° = top edge
// midpoint, increasing clockwise) — so wedge order visually matches array order.
function squareBoundaryPoint(angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(rad), dy = -Math.cos(rad);
  const tx = dx === 0 ? Infinity : (dx > 0 ? 50 / dx : -50 / dx);
  const ty = dy === 0 ? Infinity : (dy > 0 ? 50 / dy : -50 / dy);
  const t = Math.min(tx, ty);
  return [50 + t * dx, 50 + t * dy];
}
const SQUARE_CORNER_ANGLES = [45, 135, 225, 315]; // top-right, bottom-right, bottom-left, top-left

// Vertex list for wedge `i` of 5 equal-angle slices of a square, each a "pie
// slice" from the center — a slice whose angular span crosses a square corner
// needs that corner as an extra vertex, or its edge would cut straight across
// the corner instead of following the square's actual boundary.
function pentaSlicePoints(i) {
  const step = 360 / 5;
  const a0 = i * step, a1 = (i + 1) * step;
  const points = [[50, 50], squareBoundaryPoint(a0)];
  SQUARE_CORNER_ANGLES.forEach((c) => { if (c > a0 && c < a1) points.push(squareBoundaryPoint(c)); });
  points.push(squareBoundaryPoint(a1));
  return points;
}

// True area centroid of a polygon (shoelace formula) — used to recenter a
// slice's image on the wedge's own visual middle rather than its vertex mean,
// which would skew toward the shared center point.
function polygonCentroid(points) {
  let area = 0, cx = 0, cy = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i], [x1, y1] = points[(i + 1) % points.length];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  area *= 0.5;
  if (Math.abs(area) < 1e-6) return [50, 50];
  return [cx / (6 * area), cy / (6 * area)];
}

// UI-pref persistence (separate from the savefile; not user content).
const PREF_KEY = 'dextracker.ui.v1';
export function getPrefs() {
  try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch { return {}; }
}
export function setPref(key, value) {
  const p = getPrefs();
  p[key] = value;
  try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch {}
}

export function pct(part, total) {
  if (!total) return '0%';
  return (Math.round((part / total) * 1000) / 10) + '%';
}

// Simple dismissable dialog: click the backdrop or ✕ to close.
export function modal(title, bodyNodes, onClose) {
  const overlay = el('div', { class: 'modal-overlay' });
  const close = () => { overlay.remove(); if (onClose) onClose(); };
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  const box = el('div', { class: 'modal' }, [
    el('div', { class: 'modal-head' }, [
      el('h3', {}, title),
      el('button', { class: 'btn icon', title: 'Close', onclick: close }, '✕'),
    ]),
    el('div', { class: 'modal-body' }, bodyNodes),
  ]);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  return { close, box };
}

// Custom replacements for window.alert/confirm — same modal() styling as the rest
// of the app instead of an unstyled native browser dialog. Both are Promise-based
// since a modal can't block synchronously; callers await them.
export function alertDialog(message, title = 'Notice') {
  return new Promise((resolve) => {
    const m = modal(title, [
      el('p', { style: 'white-space: pre-line' }, message),
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'btn primary', onclick: () => m.close() }, 'OK'),
      ]),
    ], resolve);
  });
}

export function confirmDialog(message, title = 'Confirm') {
  return new Promise((resolve) => {
    const m = modal(title, [
      el('p', { style: 'white-space: pre-line' }, message),
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'btn', onclick: () => { resolve(false); m.close(); } }, 'Cancel'),
        el('button', { class: 'btn primary', onclick: () => { resolve(true); m.close(); } }, 'OK'),
      ]),
    ], () => resolve(false));
  });
}

// Replacement for window.prompt() — resolves the typed string on OK, null on
// Cancel/dismiss (same contract as the native version).
export function promptDialog(message, defaultValue = '', title = 'Input') {
  return new Promise((resolve) => {
    const input = el('input', { class: 'ctrl wide', value: defaultValue });
    const submit = () => { resolve(input.value); m.close(); };
    const m = modal(title, [
      el('p', { style: 'white-space: pre-line' }, message),
      input,
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'btn', onclick: () => { resolve(null); m.close(); } }, 'Cancel'),
        el('button', { class: 'btn primary', onclick: submit }, 'OK'),
      ]),
    ], () => resolve(null));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    setTimeout(() => input.focus(), 0);
  });
}

// "Pick one of several" dialog — same Promise pattern as the above. `renderRow(opt)`
// returns the DOM content for one clickable row (the caller controls what a row
// shows). Resolves the picked option, or null if dismissed without picking.
export function selectDialog(title, options, renderRow) {
  return new Promise((resolve) => {
    const m = modal(title, options.map((opt) =>
      el('div', { class: 'select-row', onclick: () => { resolve(opt); m.close(); } }, renderRow(opt))
    ), () => resolve(null));
    // Unlike alert/confirm/prompt, a row's content length varies a lot (icons +
    // several fields) — size the box to fit it instead of the fixed narrow width.
    m.box.classList.add('select-modal');
  });
}

// Trigger a client-side download of a text/JSON document (savefile export, dev
// reference-data export). Revokes the object URL after the click settles.
export function downloadJson(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
