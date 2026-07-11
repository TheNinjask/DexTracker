// Hyperspace Wild Zone Searcher (Legends Z-A "Searcher" tool). Filters the
// portal pool list (hyperspace_wild_zone.json) by star rating, type, and any
// Pokémon the player has spotted, to narrow down which zone they're looking at.
import { REF, idx, HYPERSPACE, spriteUrl, pad4 } from '../data.js';
import { el, clear, icon } from '../dom.js';

let starFilter = null; // 1-5, or null = any
let typeFilter = null; // type name, or null = any
let selectedSpecies = []; // species codes, e.g. "767", "666-g"
let speciesQuery = '';
let page = 0;
const PAGE_SIZE = 20;

// forms.json has no per-(nat, form_code) index of its own — build one lazily,
// once REF.forms is loaded.
let formsByKey = null;
function formsIndex() {
  if (!formsByKey) {
    formsByKey = new Map();
    REF.forms.forEach((f) => formsByKey.set(f.national_no + '|' + f.form_code, f));
  }
  return formsByKey;
}

// A zone's species entries are "<nat>[-<form_code letter>]", e.g. "767" or
// "666-g" — the same shape spriteUrl composes from (SPEC §3.5).
function parseSpeciesCode(code) {
  const dash = code.indexOf('-');
  return dash === -1
    ? { nat: code, formCode: '' }
    : { nat: code.slice(0, dash), formCode: code.slice(dash) };
}

function speciesInfo(code) {
  const { nat, formCode } = parseSpeciesCode(code);
  const natPad = pad4(nat);
  let name = code;
  if (formCode) {
    const f = formsIndex().get(natPad + '|' + formCode);
    if (f) name = f.form ? `${f.name} (${f.form})` : f.name;
  } else {
    const s = idx.speciesByNat.get(natPad);
    if (s) name = s.name;
  }
  return {
    code, natNo: parseInt(nat, 10), name,
    sprite: spriteUrl('LZA', 'box', nat, formCode),
    // Failsafe: some forms have no dedicated LZA box icon — fall back to the
    // base species' sprite rather than showing a broken/hidden image.
    fallbackSprite: formCode ? spriteUrl('LZA', 'box', nat, '') : null,
  };
}

let universeCache = null;
function speciesUniverse() {
  if (!universeCache) {
    const set = new Set();
    HYPERSPACE.zones.forEach((z) => z.species.forEach((c) => set.add(c)));
    universeCache = [...set].map(speciesInfo);
  }
  return universeCache;
}

function candidatesFor(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const isNum = /^\d+$/.test(q);
  return speciesUniverse()
    .filter((s) => (isNum ? String(s.natNo).includes(q) : s.name.toLowerCase().includes(q)))
    .slice(0, 60);
}

function zoneTypes() {
  const present = new Set(HYPERSPACE.zones.map((z) => z.type));
  return REF.types.filter((t) => present.has(t.name));
}

function zoneMatches(z) {
  if (starFilter != null && z.star !== starFilter) return false;
  if (typeFilter != null && z.type !== typeFilter) return false;
  if (selectedSpecies.length && !selectedSpecies.every((c) => z.species.includes(c))) return false;
  return true;
}

// --- Persistent picker nodes ---------------------------------------------
// Star/type/species buttons are built once and kept in module-level caches,
// then simply moved/re-classed on later renders instead of being recreated.
// A click only ever changes *state* (which star/type/species is selected),
// never *which images exist* — so nothing here needs to touch the network
// again after its first successful load. Only the results card (whose actual
// zone content changes) gets rebuilt on each interaction.
let starRowEl = null;
let typeRowEl = null;
let speciesInputEl = null;
let poolHost = null;
let selectedHost = null;
let resultsHost = null;

const typeButtonCache = new Map(); // type name -> <button>
const poolButtonCache = new Map(); // species code -> <button> (search-pool context)
const selectedButtonCache = new Map(); // species code -> <button> (Selected-chips context)

function ensureStarRow() {
  if (starRowEl) return starRowEl;
  starRowEl = el('div', { class: 'hwz-stars' });
  for (let n = 1; n <= 5; n++) {
    const btn = el('button', { class: 'hwz-star-btn', title: `${n} star${n > 1 ? 's' : ''}` }, '★');
    btn.addEventListener('click', () => {
      starFilter = starFilter === n ? null : n;
      page = 0;
      refreshStarOn();
      renderResults();
    });
    btn.dataset.n = String(n);
    starRowEl.appendChild(btn);
  }
  refreshStarOn();
  return starRowEl;
}

function refreshStarOn() {
  if (!starRowEl) return;
  [...starRowEl.children].forEach((btn) => {
    const n = Number(btn.dataset.n);
    btn.classList.toggle('on', starFilter != null && n <= starFilter);
  });
}

function typeButton(t) {
  let btn = typeButtonCache.get(t.name);
  if (btn) return btn;
  btn = el('button', { class: 'hwz-type-btn', title: t.name }, icon(t.icon_url, 'hwz-type-img', t.name));
  btn.addEventListener('click', () => {
    typeFilter = typeFilter === t.name ? null : t.name;
    page = 0;
    refreshTypeOn();
    renderResults();
  });
  typeButtonCache.set(t.name, btn);
  return btn;
}

function refreshTypeOn() {
  typeButtonCache.forEach((btn, name) => btn.classList.toggle('on', typeFilter === name));
}

function ensureTypeRow() {
  if (typeRowEl) return typeRowEl;
  typeRowEl = el('div', { class: 'hwz-types' });
  zoneTypes().forEach((t) => typeRowEl.appendChild(typeButton(t)));
  return typeRowEl;
}

function speciesButton(cache, s) {
  let btn = cache.get(s.code);
  if (btn) return btn;
  btn = el('button', { class: 'hwz-species-btn', title: s.name }, [
    icon(s.sprite, 'hwz-species-img', s.name, 0, s.fallbackSprite),
    el('span', { class: 'hwz-species-name' }, s.name),
  ]);
  btn.addEventListener('click', () => toggleSpecies(s.code));
  cache.set(s.code, btn);
  return btn;
}

function toggleSpecies(code) {
  const i = selectedSpecies.indexOf(code);
  if (i >= 0) selectedSpecies.splice(i, 1);
  else selectedSpecies.push(code);
  page = 0;
  refreshPool();
  refreshSelected();
  renderResults();
}

function refreshPool() {
  clear(poolHost);
  const candidates = candidatesFor(speciesQuery);
  if (candidates.length) {
    candidates.forEach((s) => {
      const btn = speciesButton(poolButtonCache, s);
      btn.classList.toggle('on', selectedSpecies.includes(s.code));
      poolHost.appendChild(btn);
    });
  } else if (speciesQuery.trim()) {
    poolHost.appendChild(el('p', { class: 'muted small' }, 'No matches.'));
  }
}

function refreshSelected() {
  clear(selectedHost);
  if (!selectedSpecies.length) return;
  selectedHost.appendChild(el('div', { class: 'hwz-selected-head small' }, `Selected (${selectedSpecies.length}) — click to remove`));
  const row = el('div', { class: 'hwz-species-pool' });
  selectedSpecies.forEach((code) => {
    const btn = speciesButton(selectedButtonCache, speciesInfo(code));
    btn.classList.add('on');
    row.appendChild(btn);
  });
  selectedHost.appendChild(row);
}

function ensureSpeciesPicker() {
  if (speciesInputEl) return;
  speciesInputEl = el('input', {
    class: 'ctrl wide hwz-species-input', type: 'search', value: speciesQuery,
    placeholder: 'Dex No. or species name…',
  });
  speciesInputEl.addEventListener('input', (e) => {
    speciesQuery = e.target.value;
    refreshPool();
  });
  poolHost = el('div', { class: 'hwz-species-pool' });
  selectedHost = el('div', {});
  refreshPool();
  refreshSelected();
}

// --- Render ----------------------------------------------------------------

export function render(root) {
  clear(root);
  const wrap = el('div', { class: 'hwz' });
  wrap.appendChild(buildFiltersCard());
  if (!resultsHost) resultsHost = el('div', {});
  clear(resultsHost);
  resultsHost.appendChild(buildResults());
  wrap.appendChild(resultsHost);
  root.appendChild(wrap);
}

function renderResults() {
  clear(resultsHost);
  resultsHost.appendChild(buildResults());
}

function buildFiltersCard() {
  const card = el('div', { class: 'card' });
  card.appendChild(el('h3', {}, 'Hyperspace Wild Zone Searcher'));
  card.appendChild(el('p', { class: 'muted small' },
    'Pick what you know about the portal — star rating, type, Pokémon you’ve seen — to narrow down the zone.'));
  card.appendChild(el('div', { class: 'hwz-block' }, [el('span', { class: 'field-label' }, 'Stars'), ensureStarRow()]));
  card.appendChild(el('div', { class: 'hwz-block' }, [el('span', { class: 'field-label' }, 'Type'), ensureTypeRow()]));
  ensureSpeciesPicker();
  card.appendChild(el('div', { class: 'hwz-block' }, [
    el('span', { class: 'field-label' }, 'Pokémon'), speciesInputEl, poolHost, selectedHost,
  ]));
  return card;
}

function buildResults() {
  const card = el('div', { class: 'card' });
  const matches = HYPERSPACE.zones.filter(zoneMatches);
  const totalPages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  if (page >= totalPages) page = totalPages - 1;
  if (page < 0) page = 0;

  card.appendChild(el('div', { class: 'hwz-results-head' }, [
    el('h3', {}, `Zones (${matches.length})`),
    totalPages > 1 ? el('div', { class: 'dev-pager' }, [
      el('button', { class: 'pgbtn tiny', disabled: page === 0 || null, onclick: () => { page--; renderResults(); } }, '‹'),
      el('span', { class: 'muted small' }, `Page ${page + 1} of ${totalPages}`),
      el('button', { class: 'pgbtn tiny', disabled: page >= totalPages - 1 || null, onclick: () => { page++; renderResults(); } }, '›'),
    ]) : null,
  ]));

  if (!matches.length) {
    card.appendChild(el('p', { class: 'muted' }, 'No zones match those filters.'));
    return card;
  }
  const pageItems = matches.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  card.appendChild(el('div', { class: 'hwz-zones' }, pageItems.map((z) => zoneCard(z))));
  return card;
}

function zoneCard(z) {
  const t = idx.typeByName.get(z.type);
  const head = el('div', { class: 'hwz-zone-head' }, [
    el('button', {
      class: 'hwz-zone-type-btn',
      title: `Filter by ${z.type}`,
      onclick: () => { typeFilter = typeFilter === z.type ? null : z.type; page = 0; refreshTypeOn(); renderResults(); },
    }, [
      t ? icon(t.icon_url, 'hwz-zone-type-img', z.type) : null,
      el('span', { class: 'hwz-zone-type-name' }, z.type),
    ]),
    el('button', {
      class: 'hwz-zone-star-btn',
      title: `Filter by ${z.star} star${z.star > 1 ? 's' : ''}`,
      onclick: () => { starFilter = starFilter === z.star ? null : z.star; page = 0; refreshStarOn(); renderResults(); },
    }, el('span', { class: 'hwz-zone-stars' }, starGlyphs(z.star))),
  ]);
  const species = el('div', { class: 'hwz-zone-species' },
    [...new Set(z.species)].map((c) => {
      const s = speciesInfo(c);
      return el('button', {
        class: 'hwz-zone-species-btn',
        title: `Filter by ${s.name}`,
        onclick: () => toggleSpecies(c),
      }, icon(s.sprite, 'hwz-zone-species-img', s.name, 0, s.fallbackSprite));
    }));
  return el('div', { class: 'hwz-zone-card' }, [head, species]);
}

function starGlyphs(n) {
  let s = '';
  for (let i = 1; i <= 5; i++) s += i <= n ? '★' : '☆';
  return s;
}
