// About / credits tab. Version comes from package.json (injected by Vite as
// __APP_VERSION__); the rest of the content lives in public/data/about.json so
// it can be edited without touching code, the same way reference_data.json is.
import { el, clear } from '../dom.js';

// Vite replaces __APP_VERSION__ at build time with package.json's version.
export const APP_VERSION = 'v' + __APP_VERSION__;

let cache = null; // about.json is static — fetch once, reuse across re-renders.

async function loadAbout() {
  if (cache) return cache;
  const res = await fetch(`${import.meta.env.BASE_URL}data/about.json`);
  if (!res.ok) throw new Error('Failed to load about.json: ' + res.status);
  cache = await res.json();
  return cache;
}

function linkList(items) {
  const list = el('ul', { class: 'about-list' });
  (items || []).forEach((c) => {
    list.appendChild(el('li', { class: 'about-item' }, [
      el('a', { class: 'btn link', href: c.url, target: '_blank', rel: 'noopener' }, c.name + ' ↗'),
      el('span', { class: 'muted small' }, c.note),
    ]));
  });
  return list;
}

export function render(root) {
  clear(root);
  const wrap = el('div', { class: 'about' });
  root.appendChild(wrap);

  // Header card: branding + version. Renders immediately (no data needed).
  wrap.appendChild(el('div', { class: 'card about-head' }, [
    el('div', { class: 'about-brand' }, [
      el('span', { class: 'about-logo' }, '◓'),
      el('div', {}, [
        el('h2', {}, 'DexTracker'),
        el('p', { class: 'muted', id: 'about-tagline' }, 'Personal Pokémon living-dex collection tracker.'),
      ]),
    ]),
    el('span', { class: 'about-version' }, APP_VERSION),
  ]));

  const body = el('div', { class: 'about-body' }, el('p', { class: 'muted' }, 'Loading…'));
  wrap.appendChild(body);

  loadAbout().then((data) => {
    if (data.tagline) {
      const tag = wrap.querySelector('#about-tagline');
      if (tag) tag.textContent = data.tagline;
    }
    clear(body);
    body.appendChild(el('div', { class: 'card' }, [
      el('h3', {}, 'Credits & sources'),
      el('p', { class: 'muted small' }, 'Sprites and reference data are provided by the following sites. DexTracker is a non-commercial fan project and is not affiliated with any of them.'),
      linkList(data.credits),
    ]));
    body.appendChild(el('div', { class: 'card' }, [
      el('h3', {}, 'Built with'),
      linkList(data.libraries),
    ]));
    if (data.legal) {
      body.appendChild(el('p', { class: 'muted small about-legal' }, data.legal));
    }
  }).catch((e) => {
    clear(body);
    body.appendChild(el('p', { class: 'error' }, 'Could not load about info. ' + e.message));
  });

  return wrap;
}
