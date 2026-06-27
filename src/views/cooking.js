// Legends Z-A cooking planner (SPEC §9). Berry pantry + recipe builder + saved recipes.
import { REF, idx } from '../data.js';
import * as store from '../store.js';
import { el, clear } from '../dom.js';

const FLAVORS = ['sweet', 'spicy', 'sour', 'bitter', 'fresh'];
let slots = new Array(8).fill(null); // berry ids

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
  const slotRow = el('div', { class: 'cook-slots' });
  slots.forEach((id, i) => {
    const sel = el('select', { class: 'ctrl', onchange: (e) => { slots[i] = e.target.value || null; render(root); } },
      [el('option', { value: '' }, '— empty —'),
       ...REF.berries.map((b) => el('option', { value: b.id, selected: b.id === id || null }, b.name))]);
    slotRow.appendChild(el('div', { class: 'cook-slot' }, [el('span', { class: 'muted small' }, `Slot ${i + 1}`), sel]));
  });
  card.appendChild(slotRow);

  const t = totalsOf(slots);
  card.appendChild(el('div', { class: 'cook-totals' }, [
    ...FLAVORS.map((f) => totalChip(f, t[f])),
    totalChip('level', t.level),
    totalChip('cal', t.calories),
  ]));
  card.appendChild(el('div', { class: 'cook-actions' }, [
    el('button', { class: 'btn', onclick: () => { slots = new Array(8).fill(null); render(root); } }, 'Clear'),
    el('button', { class: 'btn primary', onclick: () => {
      const name = prompt('Recipe name?');
      if (name == null) return;
      store.state.cooking_recipes.push({ name: name || null, note: null, berries: slots.filter(Boolean), totals: t, time: null });
      store.commit();
      render(root);
    } }, 'Save recipe'),
  ]));
  card.appendChild(el('p', { class: 'muted small' }, 'Flavour Score / Stars / Time are values-only in the source workbook (formulas unknown), so the builder sums the known flavour/level/calorie values only.'));
  return card;
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
      el('div', { class: 'recipe-berries' }, (r.berries || []).map((id) =>
        el('span', { class: 'berry-tag' }, (idx.berryById.get(id) || {}).name || id))),
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
  table.appendChild(el('tr', {}, ['Berry', ...FLAVORS, 'Lvl', 'Cal'].map((h) => el('th', {}, h))));
  REF.berries.forEach((b) => {
    table.appendChild(el('tr', {}, [
      el('td', {}, b.name),
      ...FLAVORS.map((f) => el('td', {}, String(b[f] || 0))),
      el('td', {}, String(b.level || 0)),
      el('td', {}, String(b.calories || 0)),
    ]));
  });
  card.appendChild(table);
  return card;
}
