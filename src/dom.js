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

export function icon(src, className, title, retries = 3) {
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

  let attempt = 0;
  let settled = false;
  const release = () => { if (settled) return; settled = true; active = Math.max(0, active - 1); pumpImages(); };
  img.addEventListener('load', release);
  img.addEventListener('error', () => {
    if (attempt++ < retries) {
      setTimeout(() => { img.removeAttribute('src'); img.src = src; }, 600 * attempt);
    } else {
      img.classList.add('broken');
      release(); // free the slot even when it never loads, so the queue drains
    }
  });

  waiting.push(() => { img.src = src; });
  pumpImages();
  return img;
}

function hostOf(url) {
  try { return new URL(url, location.href).hostname; } catch { return ''; }
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
