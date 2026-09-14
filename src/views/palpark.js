// PalPark - Pokéfinder (Gen 4 HG/SS "Pal Park" tool). Pick up to 6 Pokémon from
// the transferable National Dex #1-386 and see which of the 5 Pal Park areas
// each lands in, placed on a map of the park. Area data is fixed game data
// (palpark_data.json) — every #1-386 species belongs to exactly one area.
import { PALPARK, palparkIdx, speciesName, spriteUrl } from '../data.js';
import { el, clear, icon } from '../dom.js';

const MAX_SELECTED = 6;

// Reference regions (fraction of the map image's width/height) an area's icons
// are placed within. Areas aren't equal in on-screen walkable size (Forest is a
// narrow path, Field/Pond/Ocean are large open regions) — icons still wrap and
// grow the zone past this box rather than shrink to fit, since forcing every
// pick into a fixed tiny box would make them unreadable.
const ZONE_RECT = {
  forest: { left: 16, top: 19, width: 35, height: 7 },
  pond: { left: 68, top: 18, width: 18, height: 10 },
  mountain: { left: 48, top: 35, width: 28, height: 12 },
  field: { left: 10, top: 50, width: 28, height: 27 },
  ocean: { left: 56, top: 55, width: 28, height: 29 },
};

function areaName(areaId) {
  const a = PALPARK.areas.find((x) => x.id === areaId);
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
let zoneHosts = null; // areaId -> container

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

function refreshMap() {
  Object.keys(ZONE_RECT).forEach((areaId) => {
    const host = zoneHosts[areaId];
    clear(host);
    selected.filter((nat) => palparkIdx.areaByNat.get(nat) === areaId).forEach((nat) => {
      const m = monInfo(nat);
      const btn = el('button', { class: 'pp-zone-mon', title: `Remove ${m.name}`, onclick: () => removeSelected(nat) },
        icon(m.sprite, 'pp-mon-img', m.name));
      host.appendChild(btn);
    });
  });
}

function refreshAll() {
  refreshSuggestions();
  refreshSelected();
  refreshMap();
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
  zoneHosts = {};
  Object.entries(ZONE_RECT).forEach(([areaId, r]) => {
    const zone = el('div', {
      class: 'pp-zone', title: areaName(areaId),
      style: `left:${r.left}%; top:${r.top}%; width:${r.width}%; height:${r.height}%;`,
    });
    zoneHosts[areaId] = el('div', { class: 'pp-zone-mons' });
    zone.appendChild(zoneHosts[areaId]);
    map.appendChild(zone);
  });
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
