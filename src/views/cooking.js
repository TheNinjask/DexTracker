// Legends Z-A cooking planner (SPEC §9). Berry pantry + recipe builder + saved recipes.
import { REF, idx, berrySpriteUrl } from '../data.js';
import * as store from '../store.js';
import { el, clear, icon } from '../dom.js';

// Berry sprite thumbnail. Goes through icon() so its concurrency gate paces the
// 66-image burst the pantry mounts (Serebii rate-limits bursts like Bulbagarden).
function berryImg(id, name, className) {
  if (!id) return null;
  return icon(berrySpriteUrl(id), className, name || id);
}

const FLAVORS = ['sweet', 'spicy', 'sour', 'bitter', 'fresh'];
const FLAV_LABEL = { sweet: 'Sweet', spicy: 'Spicy', sour: 'Sour', bitter: 'Bitter', fresh: 'Fresh' };
// Flavour colours matching the in-game "Flavor Profile" wheel (Sweet=pink,
// Spicy=red, Sour=amber, Bitter=indigo, Fresh=green).
const FLAV_COLOR = { sweet: '#e06aa8', spicy: '#e0614b', sour: '#e0a91e', bitter: '#6a7bd0', fresh: '#3fbf8f' };
// The radar wheel walks flavours clockwise from the top, mirroring the game's
// layout: Spicy (top), Sour, Fresh, Bitter, Sweet.
const RADAR_ORDER = ['spicy', 'sour', 'fresh', 'bitter', 'sweet'];
const MAX_BERRIES = 8;
let slots = new Array(MAX_BERRIES).fill(null); // berry ids; duplicates allowed
// Picker sort: null keeps the canonical REF.berries order; otherwise a flavour
// key sorts the list by that flavour's value, strongest first.
let sortBy = null;

// Berries in the order the picker should show them. Sorting copies the array
// (never mutates REF) and is stable, so equal-flavour berries keep canonical order.
function sortedBerries() {
  if (!sortBy) return REF.berries;
  return [...REF.berries].sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0));
}

const berryCount = (id) => slots.reduce((n, x) => n + (x === id ? 1 : 0), 0);
const filledCount = () => slots.reduce((n, x) => n + (x ? 1 : 0), 0);
function addBerry(id) {
  const i = slots.indexOf(null);
  if (i >= 0) slots[i] = id;
}
function removeBerry(id) {
  const i = slots.lastIndexOf(id);
  if (i >= 0) slots[i] = null;
}

// Full re-render keeps the berry-list scroll position so adding/removing a berry
// near the bottom of the list doesn't snap it back to the top.
function rerender(root) {
  const prev = root.querySelector('.berry-list');
  const top = prev ? prev.scrollTop : 0;
  render(root);
  const next = root.querySelector('.berry-list');
  if (next) next.scrollTop = top;
}

export function render(root) {
  clear(root);
  const wrap = el('div', { class: 'cooking' });
  wrap.appendChild(buildBuilder(root));
  wrap.appendChild(buildSaved(root));
  wrap.appendChild(buildPantry());
  root.appendChild(wrap);
}

function totalsOf(berryIds) {
  const t = { sweet: 0, spicy: 0, sour: 0, bitter: 0, fresh: 0, level: 0, calories: 0 };
  berryIds.forEach((id) => {
    const b = id && idx.berryById.get(id);
    if (!b) return;
    FLAVORS.forEach((f) => (t[f] += b[f] || 0));
    t.level += b.level || 0;
    t.calories += b.calories || 0;
  });
  return t;
}

function buildBuilder(root) {
  const card = el('div', { class: 'card' });
  card.appendChild(el('h3', {}, 'Recipe builder'));
  const t = totalsOf(slots);

  const maker = el('div', { class: 'cook-maker' });
  maker.appendChild(buildPicker(root, t));
  maker.appendChild(buildOrder(t));
  card.appendChild(maker);
  card.appendChild(el('p', { class: 'muted small' }, 'Flavour Score is the sum of the five flavour totals (matching the in-game card); the ★ rating is an estimate — the real Score→Stars and cooking-time formulas aren’t in the source workbook.'));
  return card;
}

// Left "All Berries" picker — a scrollable, game-style list. Each row shows the
// berry, its colour-coded flavour breakdown, level boost and calories, plus a
// −/＋ stepper that adds/removes it from the recipe (cap MAX_BERRIES).
function buildPicker(root, t) {
  const filled = filledCount();
  const list = el('div', { class: 'berry-list' }, sortedBerries().map((b) => berryRow(root, b, filled)));
  return el('div', { class: 'cook-build' }, [
    el('div', { class: 'picker-head' }, [
      el('span', { class: 'picker-title' }, 'All Berries'),
      el('span', { class: 'picker-count' + (filled >= MAX_BERRIES ? ' full' : '') }, `${filled} / ${MAX_BERRIES}`),
    ]),
    buildSort(root),
    list,
    el('div', { class: 'cook-actions' }, [
      el('button', { class: 'btn', disabled: filled ? null : true, onclick: () => { slots = new Array(MAX_BERRIES).fill(null); render(root); } }, 'Clear'),
      el('button', { class: 'btn primary', disabled: filled ? null : true, onclick: () => {
        const name = prompt('Recipe name?');
        if (name == null) return;
        store.state.cooking_recipes.push({ name: name || null, note: null, berries: slots.filter(Boolean), totals: t, time: null });
        store.commit();
        render(root);
      } }, '＋ Make recipe'),
    ]),
  ]);
}

// Sort row: a "Default" chip (canonical order) plus one chip per flavour. The
// active chip is highlighted; clicking it again falls back to Default. Re-renders
// through rerender() so the list scroll position is preserved.
function buildSort(root) {
  const pick = (key) => () => { sortBy = sortBy === key ? null : key; rerender(root); };
  return el('div', { class: 'picker-sort' }, [
    el('span', { class: 'picker-sort-label' }, 'Sort'),
    el('button', { class: 'sort-chip' + (sortBy ? '' : ' on'), onclick: () => { sortBy = null; rerender(root); } }, 'Default'),
    ...FLAVORS.map((f) =>
      el('button', { class: `sort-chip flav-${f}` + (sortBy === f ? ' on' : ''), title: `Sort by ${FLAV_LABEL[f]}`, onclick: pick(f) }, FLAV_LABEL[f])),
  ]);
}

function berryRow(root, b, filled) {
  const cnt = berryCount(b.id);
  const full = filled >= MAX_BERRIES;
  return el('div', { class: 'blist-row' + (cnt ? ' picked' : '') }, [
    el('div', { class: 'blist-step' }, [
      el('button', { class: 'pgbtn tiny', title: 'Remove one', disabled: cnt ? null : true, onclick: () => { removeBerry(b.id); rerender(root); } }, '−'),
      el('span', { class: 'blist-count' + (cnt ? ' on' : '') }, String(cnt)),
      el('button', { class: 'pgbtn tiny', title: full ? 'Recipe full' : 'Add one', disabled: full ? true : null, onclick: () => { addBerry(b.id); rerender(root); } }, '＋'),
    ]),
    el('div', { class: 'blist-berry' }, [
      berryImg(b.id, b.name, 'berry-img'),
      el('span', { class: 'blist-name', title: b.name }, b.name),
    ]),
    el('div', { class: 'blist-flavs' }, FLAVORS.map((f) => {
      const v = b[f] || 0;
      return el('span', { class: `flav-pill flav-${f}` + (v ? '' : ' zero'), title: FLAV_LABEL[f] }, String(v));
    })),
    el('div', { class: 'blist-meta' }, [
      el('span', { class: 'blist-stat', title: 'Level boost' }, 'Lv +' + (b.level || 0)),
      el('span', { class: 'blist-stat', title: 'Calories' }, (b.calories || 0) + ' Cal'),
    ]),
  ]);
}

// "Your Order" summary card — selected berries, the flavour-profile radar, and
// the Level Boost / Energy / Flavour Score readouts, styled after the game's
// order ticket.
function buildOrder(t) {
  const chosen = slots.filter(Boolean);
  const score = FLAVORS.reduce((s, f) => s + (t[f] || 0), 0);
  const order = el('div', { class: 'cook-order' });
  order.appendChild(el('div', { class: 'order-head' }, 'Your Order'));

  const berries = el('div', { class: 'order-berries' },
    chosen.length
      ? chosen.map((id) => { const b = idx.berryById.get(id) || {}; return berryImg(id, b.name, 'berry-img'); })
      : el('span', { class: 'muted small' }, 'No berries selected'));
  order.appendChild(berries);

  order.appendChild(flavorRadar(t));

  order.appendChild(el('div', { class: 'order-stats' }, [
    orderStat('Lv. Boost', '+' + (t.level || 0)),
    orderStat('Energy', (t.calories || 0) + ' Cal.'),
  ]));

  order.appendChild(el('div', { class: 'order-score' }, [
    el('div', { class: 'order-score-row' }, [
      el('span', { class: 'order-score-label' }, 'Flavour Score'),
      el('span', { class: 'order-score-val' }, String(score)),
    ]),
    el('div', { class: 'order-stars' }, starRow(starsFor(score))),
  ]));
  return order;
}

function orderStat(label, val) {
  return el('div', { class: 'order-stat' }, [
    el('span', { class: 'order-stat-label' }, label),
    el('span', { class: 'order-stat-val' }, val),
  ]);
}

// Heuristic star tiers — the real Flavour Score→Stars curve isn't in the source
// workbook, so this just gives the card its familiar 5-star shape (score 120 in
// the reference screenshot lands on 1★).
function starsFor(score) {
  return [100, 200, 320, 460, 620].filter((th) => score >= th).length;
}
function starRow(n) {
  return Array.from({ length: 5 }, (_, i) => el('span', { class: 'star' + (i < n ? ' on' : '') }, '★'));
}

// SVG flavour-profile radar (pentagon) mirroring the in-game wheel. Built as an
// SVG string because el() uses createElement, which can't make SVG namespaced nodes.
function flavorRadar(t) {
  const S = 230, cx = S / 2, cy = S / 2, R = 78, LBL = R + 20;
  const vals = RADAR_ORDER.map((k) => t[k] || 0);
  const scaleMax = Math.max(40, Math.ceil(Math.max(...vals) / 20) * 20);
  const ang = (i) => (i * 72 - 90) * Math.PI / 180;
  const coord = (i, r) => [cx + Math.cos(ang(i)) * r, cy + Math.sin(ang(i)) * r];
  const fmt = ([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`;

  const rings = [0.25, 0.5, 0.75, 1].map((f) =>
    `<polygon class="radar-ring" points="${RADAR_ORDER.map((_, i) => fmt(coord(i, R * f))).join(' ')}"/>`).join('');
  const spokes = RADAR_ORDER.map((_, i) => {
    const [x, y] = coord(i, R);
    return `<line class="radar-spoke" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
  }).join('');
  const area = `<polygon class="radar-area" points="${RADAR_ORDER.map((_, i) => fmt(coord(i, R * (vals[i] / scaleMax)))).join(' ')}"/>`;
  const dots = RADAR_ORDER.map((k, i) => {
    const [x, y] = coord(i, R * (vals[i] / scaleMax));
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="${FLAV_COLOR[k]}"/>`;
  }).join('');
  const labels = RADAR_ORDER.map((k, i) => {
    const [lx, ly] = coord(i, LBL);
    const c = Math.cos(ang(i));
    const anchor = Math.abs(c) < 0.3 ? 'middle' : (c > 0 ? 'start' : 'end');
    return `<text class="radar-flav" x="${lx.toFixed(1)}" y="${(ly - 2).toFixed(1)}" text-anchor="${anchor}" fill="${FLAV_COLOR[k]}">${FLAV_LABEL[k]}</text>`
      + `<text class="radar-num" x="${lx.toFixed(1)}" y="${(ly + 12).toFixed(1)}" text-anchor="${anchor}">${vals[i]}</text>`;
  }).join('');

  const box = el('div', { class: 'radar-wrap' });
  box.innerHTML = `<svg class="radar" viewBox="0 0 ${S} ${S}" role="img" aria-label="Flavour profile">`
    + rings + spokes + area + dots + labels + '</svg>';
  return box;
}

function totalChip(label, val) {
  return el('div', { class: `chip flav-${label}` }, [el('span', { class: 'chip-k' }, label), el('span', { class: 'chip-v' }, String(val))]);
}

function buildSaved(root) {
  const card = el('div', { class: 'card' });
  card.appendChild(el('h3', {}, 'Saved recipes'));
  const rows = store.state.cooking_recipes || [];
  if (!rows.length) { card.appendChild(el('p', { class: 'muted' }, 'No saved recipes.')); return card; }
  rows.forEach((r, i) => {
    const t = r.totals || totalsOf(r.berries || []);
    card.appendChild(el('div', { class: 'recipe' }, [
      el('div', { class: 'recipe-head' }, [
        el('strong', {}, r.name || `Recipe ${i + 1}`),
        r.time ? el('span', { class: 'muted small' }, '⏱ ' + r.time) : null,
        t.stars ? el('span', { class: 'badge' }, '★ ' + t.stars) : null,
        t.flavour_score ? el('span', { class: 'muted small' }, 'Score ' + t.flavour_score) : null,
        el('button', { class: 'btn tiny', onclick: () => { slots = padTo8(r.berries || []); render(root); } }, 'Load'),
        el('button', { class: 'btn tiny', onclick: () => { if (confirm('Delete recipe?')) { store.state.cooking_recipes.splice(i, 1); store.commit(); render(root); } } }, '✕'),
      ]),
      r.note ? el('div', { class: 'muted small' }, r.note) : null,
      el('div', { class: 'recipe-berries' }, (r.berries || []).map((id) => {
        const b = idx.berryById.get(id) || {};
        return el('span', { class: 'berry-tag' }, [berryImg(id, b.name, 'berry-img tiny'), b.name || id]);
      })),
      el('div', { class: 'cook-totals small' }, [...FLAVORS.map((f) => totalChip(f, t[f] || 0)), totalChip('level', t.level || 0)]),
    ]));
  });
  return card;
}

function padTo8(arr) { const s = arr.slice(0, 8); while (s.length < 8) s.push(null); return s; }

function buildPantry() {
  const card = el('div', { class: 'card' });
  card.appendChild(el('h3', {}, `Berry pantry (${REF.berries.length})`));
  const table = el('table', { class: 'data-table' });
  table.appendChild(el('tr', {}, ['', 'Berry', ...FLAVORS.map((f) => FLAV_LABEL[f]), 'Lvl', 'Cal'].map((h) => el('th', {}, h))));
  REF.berries.forEach((b) => {
    table.appendChild(el('tr', {}, [
      el('td', { class: 'berry-cell' }, berryImg(b.id, b.name, 'berry-img')),
      el('td', {}, b.name),
      ...FLAVORS.map((f) => el('td', { class: 'flav-cell' },
        (b[f] || 0) ? el('span', { class: `flav-pill flav-${f}` }, String(b[f])) : '')),
      el('td', {}, String(b.level || 0)),
      el('td', {}, String(b.calories || 0)),
    ]));
  });
  card.appendChild(table);
  return card;
}
