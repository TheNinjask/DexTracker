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

// Decorative <img> (game mark / origin icon). alt is intentionally empty so a
// failed external image shows the browser's broken-image indicator rather than
// falling back to alt text (which would leak e.g. the mark code "RBY").
//
// The external host rate-limits bursts (a box page mounts ~30 marks at once), so
// on error we re-request the same URL a few times with backoff: transient
// 403/429s clear, and once it loads the service worker caches it for good. Only
// after exhausting retries do we mark it `.broken`.
export function icon(src, className, title, retries = 3) {
  const img = el('img', { class: className, src, alt: '', title: title || null });
  let attempt = 0;
  img.addEventListener('error', () => {
    if (attempt++ < retries) {
      setTimeout(() => { img.removeAttribute('src'); img.src = src; }, 600 * attempt);
    } else {
      img.classList.add('broken');
    }
  });
  return img;
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
