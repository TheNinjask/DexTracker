// PalPark - Pokéfinder (Gen 4 HG/SS "Pal Park" tool). Pick up to 6 Pokémon from
// the transferable National Dex #1-386 and see which of the 5 Pal Park areas
// each lands in, placed on a map of the park. Area data is fixed game data
// (palpark_data.json) — every #1-386 species belongs to exactly one area.
import { PALPARK, palparkIdx, speciesName, spriteUrl, exportPalParkData } from '../data.js';
import * as store from '../store.js';
import { el, clear, icon, downloadJson } from '../dom.js';

const MAX_SELECTED = 6;

// Dev-mode-only slot editor (gated the same way app.js gates the Dev tab).
function devOn() { return !!(store.state.meta && store.state.meta.dev_mode); }

const AREA_COLORS = { field: '#4caf50', forest: '#2e7d32', mountain: '#8d6e63', pond: '#29b6f6', ocean: '#1565c0' };

// Each area's on-map icon positions are hand-configured data, not computed —
// palpark_data.json's areas each carry a `slots` list of {x,y} points (% of
// the whole map image). The Nth Pokémon picked for an area goes to its Nth
// slot; picking more than the area has slots for reuses (and nudges, so nothing
// perfectly overlaps and every icon stays individually clickable) the last one.
function areaName(areaId) {
  const a = palparkIdx.areaById.get(areaId);
  return a ? a.name : areaId;
}

function monInfo(nat) {
  return { nat, name: speciesName(nat), sprite: spriteUrl('home', 'icon', nat, ''), area: palparkIdx.areaByNat.get(nat) };
}

let allMons = null;
function universe() {
  if (!allMons) allMons = PALPARK.species.map((s) => monInfo(s.national_no));
  return allMons;
}

let selected = []; // national_no strings, in pick order
let query = '';

function isSelected(nat) { return selected.includes(nat); }

function addSelected(nat) {
  if (selected.length >= MAX_SELECTED || isSelected(nat)) return;
  selected.push(nat);
  query = '';
  if (searchInputEl) searchInputEl.value = '';
  refreshAll();
}

function removeSelected(nat) {
  const i = selected.indexOf(nat);
  if (i < 0) return;
  selected.splice(i, 1);
  refreshAll();
}

// Substring match on name, exact match first, then "starts with", then
// "contains" — so e.g. querying "Mew" puts Mew itself ahead of Mewtwo.
function candidatesFor(q) {
  const qq = q.trim().toLowerCase();
  if (!qq) return [];
  const exact = [], starts = [], contains = [];
  universe().forEach((m) => {
    const name = m.name.toLowerCase();
    if (name === qq) exact.push(m);
    else if (name.startsWith(qq)) starts.push(m);
    else if (name.includes(qq)) contains.push(m);
  });
  return [...exact, ...starts, ...contains].slice(0, 30);
}

// --- Persistent nodes (survive re-render so the search input never loses
// focus/caret mid-type — only their contents are refreshed in place). ---
let searchInputEl = null;
let suggestionsHost = null;
let selectedHost = null;
let countEl = null;
let monsHost = null; // holds the individually positioned on-map icons
let slotsHost = null; // dev mode: holds the draggable numbered slot dots
let slotEditOn = false;

function ensureSearch() {
  if (searchInputEl) return;
  searchInputEl = el('input', {
    class: 'ctrl wide', type: 'search', placeholder: 'Search a Pokémon (e.g. Charizard)…',
    autocomplete: 'off',
  });
  searchInputEl.addEventListener('input', (e) => { query = e.target.value; refreshSuggestions(); });
  searchInputEl.addEventListener('focus', () => refreshSuggestions());
  suggestionsHost = el('div', { class: 'pp-suggestions' });
  document.addEventListener('click', (e) => {
    if (!searchInputEl) return;
    if (e.target !== searchInputEl && !suggestionsHost.contains(e.target)) clear(suggestionsHost);
  });
}

function suggestionRow(m) {
  const already = isSelected(m.nat);
  const full = selected.length >= MAX_SELECTED && !already;
  const disabled = already || full;
  const row = el('div', { class: 'pp-suggestion' + (disabled ? ' disabled' : '') }, [
    el('span', { class: 'pp-dex' }, `#${parseInt(m.nat, 10)}`),
    icon(m.sprite, 'pp-mon-img', m.name),
    el('span', {}, already ? `${m.name} (selected)` : m.name),
  ]);
  if (!disabled) row.addEventListener('click', () => addSelected(m.nat));
  return row;
}

function refreshSuggestions() {
  clear(suggestionsHost);
  const matches = candidatesFor(query);
  if (!query.trim()) return;
  if (!matches.length) { suggestionsHost.appendChild(el('div', { class: 'pp-suggestion disabled' }, 'No Pokémon found')); return; }
  matches.forEach((m) => suggestionsHost.appendChild(suggestionRow(m)));
}

function refreshSelected() {
  clear(selectedHost);
  countEl.textContent = `${selected.length} / ${MAX_SELECTED} selected`;
  if (!selected.length) {
    selectedHost.appendChild(el('p', { class: 'muted small' }, 'No Pokémon selected yet. Search above to add up to 6.'));
    return;
  }
  selected.forEach((nat) => {
    const m = monInfo(nat);
    selectedHost.appendChild(el('div', { class: 'pp-selected-row' }, [
      icon(m.sprite, 'pp-mon-img', m.name),
      el('span', { class: 'pp-selected-name' }, m.name),
      el('span', { class: 'badge' }, areaName(m.area)),
      el('button', { class: 'btn tiny', title: `Remove ${m.name}`, onclick: () => removeSelected(nat) }, '✕'),
    ]));
  });
}

// Every current pick, grouped by area and kept in pick order — the Nth pick
// in an area maps to that area's Nth configured slot. Shared by refreshMap()
// (which places mon icons) and refreshSlotDots() (which shows, per slot,
// whichever mon icon — if any — currently occupies it).
function groupSelectedByArea() {
  const byArea = new Map();
  selected.forEach((nat) => {
    const areaId = palparkIdx.areaByNat.get(nat);
    if (!byArea.has(areaId)) byArea.set(areaId, []);
    byArea.get(areaId).push(nat);
  });
  return byArea;
}

// A small deterministic nudge (% of map) for picks beyond an area's defined
// slot count, so they fan out instead of stacking exactly on top of the last
// slot and hiding each other — still expected to be rare (each area should
// normally define up to 6 slots, since a single area can hold all 6 picks).
const SLOT_OVERFLOW_NUDGE = 1.5;

function refreshMap() {
  clear(monsHost);
  const byArea = groupSelectedByArea();
  byArea.forEach((nats, areaId) => {
    const area = palparkIdx.areaById.get(areaId);
    const slots = (area && area.slots) || [];
    nats.forEach((nat, i) => {
      if (!slots.length) return;
      const overflow = Math.max(0, i - (slots.length - 1));
      const slot = slots[Math.min(i, slots.length - 1)];
      const x = slot.x + overflow * SLOT_OVERFLOW_NUDGE;
      const y = slot.y + overflow * SLOT_OVERFLOW_NUDGE;
      const m = monInfo(nat);
      const btn = el('button', {
        class: 'pp-zone-mon', title: `Remove ${m.name}`,
        style: `left:${x}%; top:${y}%;`,
        onclick: () => removeSelected(nat),
      }, icon(m.sprite, 'pp-mon-img', m.name));
      monsHost.appendChild(btn);
    });
  });
}

function refreshAll() {
  refreshSuggestions();
  refreshSelected();
  refreshMap();
  refreshSlotDots(); // keep dev-mode dots' occupant icons in sync with picks
}

// --- Dev mode: slot position editor ----------------------------------------
// Shows every configured slot (every area, not just occupied ones) as a
// draggable dot instead of the normal picked-Pokémon icons — dev mode is
// about editing the raw palpark_data.json layout, not the picker, so
// dragging replaces (rather than adds to) the click-to-remove mon icons. A
// slot currently occupied by a pick (same rule refreshMap() uses: the Nth
// pick in an area goes to its Nth slot) shows that Pokémon's own icon
// instead of a bare number, so you can see exactly what would render there.
function refreshSlotDots() {
  if (!slotsHost) return;
  clear(slotsHost);
  if (!slotEditOn) return;
  const byArea = groupSelectedByArea();
  PALPARK.areas.forEach((area) => {
    const nats = byArea.get(area.id) || [];
    (area.slots || []).forEach((slot, i) => {
      const occupant = i < nats.length ? monInfo(nats[i]) : null;
      // Inline background wins over the .occupied CSS rule's own background,
      // so pick it here instead: white behind a sprite (so it reads clearly),
      // the area's color behind a bare number (so empty slots stay grouped
      // by area at a glance).
      const bg = occupant ? '#fff' : (AREA_COLORS[area.id] || '#e91e63');
      const dot = el('button', {
        class: 'pp-slot-dot' + (occupant ? ' occupied' : ''),
        title: occupant ? `${occupant.name} — ${area.name} slot ${i + 1}` : `${area.name} slot ${i + 1}`,
        style: `left:${slot.x}%; top:${slot.y}%; background:${bg};`,
      }, occupant ? icon(occupant.sprite, 'pp-slot-dot-img', occupant.name) : String(i + 1));
      attachDrag(dot, slot);
      slotsHost.appendChild(dot);
    });
  });
}

// Drag a slot dot to a new position, updating the live PALPARK slot object
// (the same object refreshMap() and exportPalParkData() both read) directly —
// no separate "editor state" to sync back later.
function attachDrag(dot, slot) {
  dot.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dot.setPointerCapture(e.pointerId);
    const map = currentRoot && currentRoot.querySelector('.pp-map');
    if (!map) return;
    const move = (ev) => {
      const rect = map.getBoundingClientRect();
      const x = Math.min(100, Math.max(0, ((ev.clientX - rect.left) / rect.width) * 100));
      const y = Math.min(100, Math.max(0, ((ev.clientY - rect.top) / rect.height) * 100));
      slot.x = Math.round(x * 100) / 100;
      slot.y = Math.round(y * 100) / 100;
      dot.style.left = `${slot.x}%`;
      dot.style.top = `${slot.y}%`;
    };
    const up = () => {
      dot.releasePointerCapture(e.pointerId);
      dot.removeEventListener('pointermove', move);
      dot.removeEventListener('pointerup', up);
    };
    dot.addEventListener('pointermove', move);
    dot.addEventListener('pointerup', up);
  });
}

function toggleSlotEdit(on) {
  slotEditOn = on;
  if (monsHost) monsHost.style.display = on ? 'none' : '';
  if (slotsHost) slotsHost.style.display = on ? '' : 'none';
  refreshSlotDots();
}

// A snug border/frame around the map — like .tool-pick-box's fixed padding
// around its icon — rather than a full-width card with the (smaller, aspect-
// bounded) map centered inside it and lots of leftover card background
// showing around it. The frame (.pp-map-frame) shrink-wraps to whatever size
// .pp-map itself is; .pp-map stays unpadded so its own bounds exactly match
// the image (zone overlays are positioned as % of .pp-map, so padding there
// would misalign them against the actual image content).
function buildMap() {
  const base = import.meta.env.BASE_URL;
  const frame = el('div', { class: 'pp-map-frame' });
  const map = el('div', { class: 'pp-map' });
  map.appendChild(el('img', { class: 'pp-map-img', src: `${base}icons/palpark-map.png`, alt: 'Pal Park overworld map' }));
  monsHost = el('div', { class: 'pp-map-mons', style: slotEditOn ? 'display:none;' : null });
  map.appendChild(monsHost);
  slotsHost = el('div', { class: 'pp-map-slots', style: slotEditOn ? null : 'display:none;' });
  map.appendChild(slotsHost);
  frame.appendChild(map);
  return frame;
}

export function render(root) {
  clear(root);
  ensureSearch();

  const layout = el('div', { class: 'pp-layout' });

  // Map left, picker right on desktop — mirrors Box View's own main-content/
  // sidebar split (grid col 1 flexible, col 2 fixed width). Below the
  // breakpoint they stack into a single column; CSS `order` there (not DOM
  // order, which stays map-then-picker for the desktop layout above) puts
  // the picker on top, since picking is the first thing to do.
  const mapCard = el('div', { class: 'pp-map-card' });
  const mapWrap = el('div', { class: 'pp-map-wrap' });
  mapWrap.appendChild(buildMap());
  mapCard.appendChild(mapWrap);
  layout.appendChild(mapCard);

  const pickerCard = el('div', { class: 'card pp-picker-card' });
  pickerCard.appendChild(el('h3', {}, 'PalPark - Pokéfinder'));
  pickerCard.appendChild(el('p', { class: 'muted small' },
    'Pick up to 6 Pokémon (National Dex #1-386) to see which Pal Park area each lands in.'));
  countEl = el('span', { class: 'muted small' }, `${selected.length} / ${MAX_SELECTED} selected`);
  pickerCard.appendChild(el('div', { class: 'pp-search-row' }, [searchInputEl, countEl]));
  pickerCard.appendChild(suggestionsHost);
  selectedHost = el('div', { class: 'pp-selected-list' });
  pickerCard.appendChild(selectedHost);

  if (devOn()) {
    const chk = el('input', { type: 'checkbox', checked: slotEditOn ? '' : null });
    chk.addEventListener('change', (e) => toggleSlotEdit(e.target.checked));
    pickerCard.appendChild(el('div', { class: 'pp-dev-row' }, [
      el('label', { class: 'toggle' }, [chk, el('span', {}, 'Dev: edit slot positions')]),
      el('button', { class: 'btn tiny', onclick: () => downloadJson('palpark_data.json', exportPalParkData()) }, 'Export palpark_data.json'),
    ]));
  }
  layout.appendChild(pickerCard);

  root.appendChild(layout);
  refreshAll();
  currentRoot = root;
  requestAnimationFrame(() => sizeMap());
  watchResize();
}

// --- Map sizing — same technique as Box View's own grid (box.js: sizeGrid /
// watchResize). Above the breakpoint the map is capped to fit the remaining
// viewport height (bounded against the nav sidebar's actual bottom edge) so it
// never forces the page to scroll; below the breakpoint (map stacked above the
// picker) that reasoning no longer applies, so it's left to plain CSS
// (width:100%, height:auto) and the page scrolls like everything else there.
//
// Unlike box.js (a top-level tab always rendered into the same persistent
// #content element), this view is remounted into a brand-new element every
// time the user navigates into it via the Tools tab — so the resize listener
// (registered once, for the module's lifetime) always resizes whatever
// `currentRoot` currently is, rather than closing over a `root` from
// registration time that a later visit would silently orphan. ---
const MAP_ASPECT = 1022 / 844; // native palpark-map.png dimensions
const DESKTOP_BREAKPOINT = 860; // matches .pp-layout's own media query
const FRAME_PADDING = 6; // must match .pp-map-frame's own CSS padding
let currentRoot = null;

function sizeMap() {
  if (!currentRoot) return;
  const wrap = currentRoot.querySelector('.pp-map-wrap');
  const frame = currentRoot.querySelector('.pp-map-frame');
  const map = currentRoot.querySelector('.pp-map');
  if (!wrap || !frame || !map) return;
  map.style.width = ''; map.style.height = '';
  if (window.innerWidth <= DESKTOP_BREAKPOINT) return;
  const availW = wrap.clientWidth - FRAME_PADDING * 2;
  const sidebar = document.getElementById('sidebar');
  const bottomBound = sidebar ? sidebar.getBoundingClientRect().bottom : window.innerHeight;
  const availH = bottomBound - frame.getBoundingClientRect().top - 10 - FRAME_PADDING * 2;
  let w = availW, h = w / MAP_ASPECT;
  if (h > availH) { h = Math.max(1, availH); w = h * MAP_ASPECT; }
  map.style.width = `${Math.round(w)}px`;
  map.style.height = `${Math.round(h)}px`;
}

let resizeWatched = false;
function watchResize() {
  if (resizeWatched) return;
  resizeWatched = true;
  let raf = 0;
  const resize = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(sizeMap); };
  window.addEventListener('resize', resize);
  const appBody = document.querySelector('.app-body');
  if (appBody && window.ResizeObserver) new ResizeObserver(resize).observe(appBody);
}
