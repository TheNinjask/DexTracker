// Hyperspace Wild Zone Searcher (Legends Z-A "Searcher" tool). Filters the
// portal pool list (hyperspace_wild_zone.json) by star rating, type, and any
// Pokémon the player has spotted, to narrow down which zone they're looking at.
import { REF, idx, HYPERSPACE, spriteUrl, pad4 } from '../data.js';
import { el, clear, icon } from '../dom.js';

let starFilter = null; // 1-5, or null = any
let typeFilter = null; // type name, or null = any
let selectedSpecies = []; // species codes, e.g. "767", "666-g"
let speciesQuery = '';
let refocusQuery = false; // restore focus/caret to the search box after a re-render

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
  return { code, natNo: parseInt(nat, 10), name, sprite: spriteUrl('LZA', 'box', nat, formCode) };
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

function toggleSpecies(root, code) {
  const i = selectedSpecies.indexOf(code);
  if (i >= 0) selectedSpecies.splice(i, 1);
  else selectedSpecies.push(code);
  render(root);
}

export function render(root) {
  clear(root);
  const wrap = el('div', { class: 'hwz' });
  wrap.appendChild(buildFilters(root));
  wrap.appendChild(buildResults(root));
  root.appendChild(wrap);

  if (refocusQuery) {
    const inp = root.querySelector('.hwz-species-input');
    if (inp) { inp.focus(); try { const n = inp.value.length; inp.setSelectionRange(n, n); } catch {} }
    refocusQuery = false;
  }
}

function buildFilters(root) {
  const card = el('div', { class: 'card' });
  card.appendChild(el('h3', {}, 'Hyperspace Wild Zone Searcher'));
  card.appendChild(el('p', { class: 'muted small' },
    'Pick what you know about the portal — star rating, type, Pokémon you’ve seen — to narrow down the zone.'));
  card.appendChild(buildStarPicker(root));
  card.appendChild(buildTypePicker(root));
  card.appendChild(buildSpeciesPicker(root));
  return card;
}

function buildStarPicker(root) {
  const row = el('div', { class: 'hwz-stars' });
  for (let n = 1; n <= 5; n++) {
    const on = starFilter != null && n <= starFilter;
    row.appendChild(el('button', {
      class: `hwz-star-btn ${on ? 'on' : ''}`,
      title: `${n} star${n > 1 ? 's' : ''}`,
      onclick: () => { starFilter = starFilter === n ? null : n; render(root); },
    }, '★'));
  }
  return el('div', { class: 'hwz-block' }, [el('span', { class: 'field-label' }, 'Stars'), row]);
}

function buildTypePicker(root) {
  const row = el('div', { class: 'hwz-types' });
  zoneTypes().forEach((t) => {
    const on = typeFilter === t.name;
    row.appendChild(el('button', {
      class: `hwz-type-btn ${on ? 'on' : ''}`,
      title: t.name,
      onclick: () => { typeFilter = on ? null : t.name; render(root); },
    }, icon(t.icon_url, 'hwz-type-img', t.name)));
  });
  return el('div', { class: 'hwz-block' }, [el('span', { class: 'field-label' }, 'Type'), row]);
}

function buildSpeciesPicker(root) {
  const wrap = el('div', { class: 'hwz-block' });
  wrap.appendChild(el('span', { class: 'field-label' }, 'Pokémon'));
  wrap.appendChild(el('input', {
    class: 'ctrl wide hwz-species-input', type: 'search', value: speciesQuery,
    placeholder: 'Dex No. or species name…',
    oninput: (e) => { speciesQuery = e.target.value; refocusQuery = true; render(root); },
  }));

  const candidates = candidatesFor(speciesQuery);
  if (candidates.length) {
    wrap.appendChild(el('div', { class: 'hwz-species-pool' },
      candidates.map((s) => speciesButton(root, s))));
  } else if (speciesQuery.trim()) {
    wrap.appendChild(el('p', { class: 'muted small' }, 'No matches.'));
  }

  if (selectedSpecies.length) {
    wrap.appendChild(el('div', { class: 'hwz-selected-head small' }, `Selected (${selectedSpecies.length}) — click to remove`));
    wrap.appendChild(el('div', { class: 'hwz-species-pool' },
      selectedSpecies.map((c) => speciesButton(root, speciesInfo(c)))));
  }
  return wrap;
}

function speciesButton(root, s) {
  const on = selectedSpecies.includes(s.code);
  return el('button', {
    class: `hwz-species-btn ${on ? 'on' : ''}`,
    title: s.name,
    onclick: () => toggleSpecies(root, s.code),
  }, [icon(s.sprite, 'hwz-species-img', s.name), el('span', { class: 'hwz-species-name' }, s.name)]);
}

function buildResults(root) {
  const card = el('div', { class: 'card' });
  const hasFilter = starFilter != null || typeFilter != null || selectedSpecies.length > 0;
  if (!hasFilter) {
    card.appendChild(el('h3', {}, 'Zones'));
    card.appendChild(el('p', { class: 'muted' }, 'Pick a star rating, type, and/or Pokémon above to search zones.'));
    return card;
  }

  const matches = HYPERSPACE.zones.filter(zoneMatches);
  card.appendChild(el('h3', {}, `Zones (${matches.length})`));
  if (!matches.length) {
    card.appendChild(el('p', { class: 'muted' }, 'No zones match those filters.'));
    return card;
  }
  card.appendChild(el('div', { class: 'hwz-zones' }, matches.map((z) => zoneCard(z))));
  return card;
}

function zoneCard(z) {
  const t = idx.typeByName.get(z.type);
  const head = el('div', { class: 'hwz-zone-head' }, [
    t ? icon(t.icon_url, 'hwz-zone-type-img', z.type) : null,
    el('span', { class: 'hwz-zone-type-name' }, z.type),
    el('span', { class: 'hwz-zone-stars' }, starGlyphs(z.star)),
  ]);
  const species = el('div', { class: 'hwz-zone-species' },
    [...new Set(z.species)].map((c) => {
      const s = speciesInfo(c);
      return icon(s.sprite, 'hwz-zone-species-img', s.name);
    }));
  return el('div', { class: 'hwz-zone-card' }, [head, species]);
}

function starGlyphs(n) {
  let s = '';
  for (let i = 1; i <= 5; i++) s += i <= n ? '★' : '☆';
  return s;
}
