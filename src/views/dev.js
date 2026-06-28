// Reference-data editor — dev mode only (gated in app.js by savefile meta.dev_mode).
// Reference data (SPEC §3) is normally read-only seed data; this lets a maintainer
// CRUD species / forms / dexes / dex_mappings in memory and export an updated
// reference_data.json to commit to the repo. Nothing here is persisted — edits live
// for the session only (export to keep them).
import {
  REF, speciesName, spriteUrl, pad3, pad4,
  upsertSpecies, removeSpecies,
  upsertForm, removeForm,
  upsertDex, removeDex,
  upsertMappingRow, removeMappingRow,
  upsertGame, removeGame,
  addImageSource, renameImageSource, removeImageSource,
  setImageVariant, removeImageVariant,
  exportReferenceData,
} from '../data.js';
import { el, clear, dataTable, icon, downloadJson } from '../dom.js';

const SECTIONS = [
  { id: 'species', label: 'Species' },
  { id: 'forms', label: 'Forms' },
  { id: 'dexes', label: 'Dexes' },
  { id: 'mappings', label: 'Dex mappings' },
  { id: 'games', label: 'Games' },
  { id: 'sources', label: 'Sprite sources' },
];

let section = 'species';
// Per-section UI state so switching sections doesn't bleed edit/filter state.
const filters = { species: '', forms: '', dexes: '', mappings: '', games: '', sources: '' };
const editing = { species: null, forms: null, dexes: null, mappings: null, games: null, sources: null };
let mappingDex = null; // selected dex id for the mappings editor
let srcName = null;     // selected source name for the sprite-source editor
let sampleNo = '025';   // national # used for sprite-source preview thumbnails
// CSS selector of an input to refocus after a keystroke-triggered re-render
// (otherwise typing into the filter / sample box loses focus per character).
let refocusSel = null;

// Build a sprite-source preview URL for the configured sample #. Returns null when
// the template can't form a real URL yet (so we don't flash a broken image while
// the prefix/suffix are still being typed, and skip dexes Pikachu isn't part of).
function sampleUrl(prefix, suffix) {
  const n = pad3(sampleNo);
  if (!prefix || !suffix || !n) return null;
  return prefix + n + suffix;
}

// Cap rendered rows — the full species (1025) / forms (400) lists are too heavy to
// mount at once. The filter box is the way to reach a specific record.
const ROW_LIMIT = 200;

export function render(root) {
  clear(root);
  const wrap = el('div', { class: 'dev' });

  wrap.appendChild(el('div', { class: 'card dev-head' }, [
    el('div', {}, [
      el('h3', {}, 'Reference data editor'),
      el('p', { class: 'muted small' }, 'Dev mode. Edits change the in-memory reference data for this session only — Export to save a reference_data.json you can commit to the repo.'),
    ]),
    el('button', { class: 'btn primary', onclick: () => {
      downloadJson('reference_data.json', exportReferenceData());
    } }, '⬇︎  Export reference_data.json'),
  ]));

  wrap.appendChild(el('div', { class: 'dev-tabs' }, SECTIONS.map((s) =>
    el('button', { class: 'btn' + (s.id === section ? ' active' : ''),
      onclick: () => { section = s.id; render(root); } }, s.label))));

  if (section === 'species') renderSpecies(wrap, root);
  else if (section === 'forms') renderForms(wrap, root);
  else if (section === 'dexes') renderDexes(wrap, root);
  else if (section === 'mappings') renderMappings(wrap, root);
  else if (section === 'games') renderGames(wrap, root);
  else renderSources(wrap, root);

  root.appendChild(wrap);

  // Re-rendering rebuilds inputs; put focus + caret back so typing flows.
  if (refocusSel) {
    const inp = wrap.querySelector(refocusSel);
    if (inp) { inp.focus(); const n = inp.value.length; inp.setSelectionRange(n, n); }
    refocusSel = null;
  }
}

// Shared filter input bound to filters[section].
function filterInput(root) {
  return el('input', {
    class: 'ctrl', placeholder: 'Filter…', value: filters[section],
    oninput: (e) => { filters[section] = e.target.value; refocusSel = '.dev-filter .ctrl'; render(root); },
  });
}

function limitNote(shown, total) {
  if (total <= shown) return el('span', { class: 'muted small' }, `${total} record(s)`);
  return el('span', { class: 'muted small' }, `Showing ${shown} of ${total} — refine the filter to see more.`);
}

function typeOptions(selected, placeholder) {
  return el('select', { class: 'ctrl' }, [
    el('option', { value: '' }, placeholder),
    ...REF.types.map((t) => el('option', { value: t.name, selected: t.name === selected ? '' : null }, t.name)),
  ]);
}

// ---- Species ----------------------------------------------------------------
function renderSpecies(wrap, root) {
  wrap.appendChild(buildSpeciesForm(root));

  const q = filters.species.trim().toLowerCase();
  const all = REF.species;
  const matched = q
    ? all.filter((s) => s.national_no.includes(q) || (s.name || '').toLowerCase().includes(q))
    : all;
  const rows = matched.slice(0, ROW_LIMIT);

  wrap.appendChild(el('div', { class: 'dev-filter' }, [filterInput(root), limitNote(rows.length, matched.length)]));

  const headers = ['Nat #', 'Gen', 'Name', 'Type 1', 'Type 2', ''];
  const body = rows.map((s) => [
    { c: 'mono', v: s.national_no },
    String(s.generation || ''),
    s.name || '',
    s.type1 || '',
    s.type2 || '',
    rowActions(
      () => { editing.species = s; render(root); },
      () => { if (confirm(`Remove species ${s.national_no} ${s.name}? Forms and dex mappings referencing it will dangle.`)) { if (editing.species === s) editing.species = null; removeSpecies(s.national_no); render(root); } },
    ),
  ]);
  wrap.appendChild(el('div', { class: 'table-wrap' }, dataTable(headers, body)));
}

function buildSpeciesForm(root) {
  const p = editing.species || {};
  const nat = el('input', { class: 'ctrl', placeholder: 'Nat # (e.g. 0001)', value: p.national_no || '' });
  const gen = el('input', { class: 'ctrl', placeholder: 'Gen', value: p.generation != null ? String(p.generation) : '' });
  const name = el('input', { class: 'ctrl', placeholder: 'Name', value: p.name || '' });
  const type1 = typeOptions(p.type1, '— type 1 —');
  const type2 = typeOptions(p.type2, '— type 2 —');
  const link = el('input', { class: 'ctrl wide', placeholder: 'Serebii link', value: p.serebii_link || '' });

  const save = el('button', { class: 'btn primary', onclick: () => {
    const key = pad4(nat.value);
    if (!key) { alert('A national number is required.'); return; }
    if (!name.value.trim()) { alert('A name is required.'); return; }
    upsertSpecies({
      national_no: key,
      generation: gen.value.trim() ? parseInt(gen.value, 10) : null,
      name: name.value.trim(),
      type1: type1.value || null,
      type2: type2.value || null,
      serebii_link: link.value.trim() || null,
    });
    editing.species = null;
    render(root);
  } }, editing.species ? 'Save changes' : 'Add species');

  return formCard(
    editing.species ? `Edit ${p.national_no} ${p.name || ''}` : 'Add / update species',
    [nat, gen, name, type1, type2, link],
    save, () => { editing.species = null; render(root); }, !!editing.species,
  );
}

// ---- Forms ------------------------------------------------------------------
function renderForms(wrap, root) {
  wrap.appendChild(buildFormForm(root));

  const q = filters.forms.trim().toLowerCase();
  const all = REF.forms;
  const matched = q
    ? all.filter((f) => f.national_no.includes(q) || (f.name || '').toLowerCase().includes(q) || (f.form || '').toLowerCase().includes(q))
    : all;
  const rows = matched.slice(0, ROW_LIMIT);

  wrap.appendChild(el('div', { class: 'dev-filter' }, [filterInput(root), limitNote(rows.length, matched.length)]));

  const headers = ['Nat #', 'Name', 'Form', 'Code', 'Group', ''];
  const body = rows.map((f) => [
    { c: 'mono', v: f.national_no },
    f.name || '',
    f.form || '',
    { c: 'mono', v: f.form_code || '' },
    { c: 'muted small', v: f.box_group || '' },
    rowActions(
      () => { editing.forms = f; render(root); },
      () => { if (confirm(`Remove form ${f.name} (${f.form})?`)) { if (editing.forms === f) editing.forms = null; removeForm(f.national_no, f.form_code); render(root); } },
    ),
  ]);
  wrap.appendChild(el('div', { class: 'table-wrap' }, dataTable(headers, body)));
}

function buildFormForm(root) {
  const p = editing.forms || {};
  const nat = el('input', { class: 'ctrl', placeholder: 'Nat #', value: p.national_no || '' });
  const name = el('input', { class: 'ctrl', placeholder: 'Species name', value: p.name || '' });
  const form = el('input', { class: 'ctrl', placeholder: 'Form (e.g. Alolan)', value: p.form || '' });
  const code = el('input', { class: 'ctrl', placeholder: 'Form code (e.g. -a)', value: p.form_code || '' });
  const codeSp = el('input', { class: 'ctrl', placeholder: 'Form code (special)', value: p.form_code_special || '' });
  const group = el('input', { class: 'ctrl', placeholder: 'Box group', value: p.box_group || '' });
  const gen = el('input', { class: 'ctrl', placeholder: 'Gen', value: p.generation != null ? String(p.generation) : '' });
  const link = el('input', { class: 'ctrl wide', placeholder: 'Serebii link', value: p.serebii_link || '' });

  // Live sprite preview (home source) for the typed nat # + form code.
  const preview = el('span', { class: 'origin-preview' });
  const refresh = () => {
    clear(preview);
    const key = pad4(nat.value);
    if (key) preview.appendChild(el('img', { class: 'hof-img preview', src: spriteUrl('home', 'normal', key, code.value || ''), alt: '' }));
    preview.appendChild(el('span', { class: 'muted small' }, key ? `#${parseInt(key, 10)} ${speciesName(key)}` : 'Enter a national number'));
  };
  nat.addEventListener('input', refresh);
  code.addEventListener('input', refresh);

  const save = el('button', { class: 'btn primary', onclick: () => {
    const key = pad4(nat.value);
    if (!key) { alert('A national number is required.'); return; }
    if (!form.value.trim()) { alert('A form name is required.'); return; }
    upsertForm({
      national_no: key,
      generation: gen.value.trim() ? parseInt(gen.value, 10) : null,
      form: form.value.trim(),
      form_code: code.value.trim(),
      form_code_special: codeSp.value.trim() || code.value.trim(),
      name: name.value.trim() || speciesName(key),
      box_group: group.value.trim() || null,
      serebii_link: link.value.trim() || null,
    });
    editing.forms = null;
    render(root);
  } }, editing.forms ? 'Save changes' : 'Add form');

  const card = formCard(
    editing.forms ? `Edit ${p.name || ''} (${p.form || ''})` : 'Add / update form',
    [nat, name, form, code, codeSp, group, gen, link],
    save, () => { editing.forms = null; render(root); }, !!editing.forms, preview,
  );
  refresh();
  return card;
}

// ---- Dexes ------------------------------------------------------------------
function renderDexes(wrap, root) {
  wrap.appendChild(buildDexForm(root));

  const q = filters.dexes.trim().toLowerCase();
  const all = REF.dexes;
  const matched = q ? all.filter((d) => (d.id || '').toLowerCase().includes(q) || (d.name || '').toLowerCase().includes(q)) : all;

  wrap.appendChild(el('div', { class: 'dev-filter' }, [filterInput(root), limitNote(matched.length, matched.length)]));

  const headers = ['Id', 'Name', 'Regional #', 'Sprite src', 'Main', 'Other', ''];
  const body = matched.map((d) => [
    d.id || '',
    d.name || '',
    d.has_regional_no ? '✓' : '',
    { c: 'mono', v: d.sprite_source || '' },
    d.main_variant || '',
    d.other_variant || '',
    rowActions(
      () => { editing.dexes = d; render(root); },
      () => { if (confirm(`Remove dex "${d.id}"? Its dex_mappings will be deleted too.`)) { if (editing.dexes === d) editing.dexes = null; removeDex(d.id); render(root); } },
    ),
  ]);
  wrap.appendChild(el('div', { class: 'table-wrap' }, dataTable(headers, body)));
}

function buildDexForm(root) {
  const p = editing.dexes || {};
  const id = el('input', { class: 'ctrl', placeholder: 'Id (e.g. SV Dex)', value: p.id || '' });
  const name = el('input', { class: 'ctrl', placeholder: 'Name', value: p.name || '' });
  const regional = el('input', { type: 'checkbox', checked: p.has_regional_no ? '' : null });
  const mark = el('input', { class: 'ctrl', placeholder: 'Mark code', value: p.mark_code || '' });
  const sprite = el('select', { class: 'ctrl', title: 'Which sprite-source artwork this dex renders (see the Sprite sources tab)' }, [
    el('option', { value: '' }, '— sprite source —'),
    ...Object.keys(REF.imageSources).map((k) => el('option', { value: k, selected: k === p.sprite_source ? '' : null }, k)),
  ]);
  const sheet = el('input', { class: 'ctrl', placeholder: 'Source sheet', value: p.source_sheet || '' });
  // Variants are the sub-keys of the chosen sprite source (normal/shiny/art/icon),
  // so offer them as pickers that rebuild when the source changes.
  const mainV = el('select', { class: 'ctrl', title: 'Main variant' });
  const otherV = el('select', { class: 'ctrl', title: 'Other variant' });
  const fillVariants = (sel, current) => {
    const variants = Object.keys(REF.imageSources[sprite.value] || {});
    clear(sel);
    sel.appendChild(el('option', { value: '' }, '— variant —'));
    variants.forEach((v) => sel.appendChild(el('option', { value: v, selected: v === current ? '' : null }, v)));
    // Preserve an out-of-list legacy value so editing doesn't silently drop it.
    if (current && !variants.includes(current)) sel.appendChild(el('option', { value: current, selected: '' }, current + ' (custom)'));
  };
  fillVariants(mainV, p.main_variant);
  fillVariants(otherV, p.other_variant);
  sprite.addEventListener('change', () => { fillVariants(mainV, mainV.value); fillVariants(otherV, otherV.value); });

  const save = el('button', { class: 'btn primary', onclick: () => {
    if (!id.value.trim()) { alert('A dex id is required.'); return; }
    if (editing.dexes && editing.dexes.id !== id.value.trim() && REF.dexes.some((d) => d.id === id.value.trim())) {
      alert('Another dex already uses that id.'); return;
    }
    upsertDex({
      id: id.value.trim(),
      name: name.value.trim(),
      has_regional_no: regional.checked,
      mark_code: mark.value.trim() || null,
      sprite_source: sprite.value || null,
      source_sheet: sheet.value.trim() || null,
      main_variant: mainV.value || null,
      other_variant: otherV.value || null,
    });
    editing.dexes = null;
    render(root);
  } }, editing.dexes ? 'Save changes' : 'Add dex');

  return formCard(
    editing.dexes ? `Edit ${p.id || ''}` : 'Add / update dex',
    [id, name, el('label', { class: 'toggle' }, [regional, el('span', {}, 'has regional #')]),
      mark, labeled('Sprite source', sprite), sheet, labeled('Main variant', mainV), labeled('Other variant', otherV)],
    save, () => { editing.dexes = null; render(root); }, !!editing.dexes,
  );
}

// ---- Dex mappings -----------------------------------------------------------
function renderMappings(wrap, root) {
  // Only dexes that carry regional numbering can have mappings.
  const dexes = REF.dexes.filter((d) => d.has_regional_no);
  if (!mappingDex || !dexes.some((d) => d.id === mappingDex)) {
    mappingDex = dexes.length ? dexes[0].id : null;
  }

  const picker = el('select', { class: 'ctrl', onchange: (e) => { mappingDex = e.target.value; editing.mappings = null; render(root); } },
    dexes.map((d) => el('option', { value: d.id, selected: d.id === mappingDex ? '' : null }, d.id)));
  wrap.appendChild(el('div', { class: 'card dev-mapping-head' }, [
    el('span', { class: 'field-label' }, 'Dex'), picker,
  ]));

  if (!mappingDex) {
    wrap.appendChild(el('p', { class: 'muted' }, 'No dex with regional numbering. Enable "has regional #" on a dex first.'));
    return;
  }

  wrap.appendChild(buildMappingForm(root));

  const q = filters.mappings.trim().toLowerCase();
  const all = REF.dexMappings[mappingDex] || [];
  const matched = q
    ? all.filter((m) => m.national_no.includes(q) || m.regional_no.includes(q) || speciesName(m.national_no).toLowerCase().includes(q))
    : all;
  const rows = matched.slice(0, ROW_LIMIT);

  wrap.appendChild(el('div', { class: 'dev-filter' }, [filterInput(root), limitNote(rows.length, matched.length)]));

  const headers = ['Regional #', 'Nat #', 'Species', ''];
  const body = rows.map((m) => [
    { c: 'mono', v: m.regional_no },
    { c: 'mono', v: m.national_no },
    speciesName(m.national_no),
    rowActions(
      () => { editing.mappings = m; render(root); },
      () => { if (confirm(`Remove ${m.regional_no} → ${m.national_no} from ${mappingDex}?`)) { if (editing.mappings === m) editing.mappings = null; removeMappingRow(mappingDex, m.national_no); render(root); } },
    ),
  ]);
  wrap.appendChild(el('div', { class: 'table-wrap' }, dataTable(headers, body)));
}

function buildMappingForm(root) {
  const p = editing.mappings || {};
  const regional = el('input', { class: 'ctrl', placeholder: 'Regional #', value: p.regional_no || '' });
  const nat = el('input', { class: 'ctrl', placeholder: 'Nat #', value: p.national_no || '' });

  const preview = el('span', { class: 'origin-preview' });
  const refresh = () => {
    clear(preview);
    const key = pad4(nat.value);
    preview.appendChild(el('span', { class: 'muted small' }, key ? `#${parseInt(key, 10)} ${speciesName(key)}` : 'Enter a national number'));
  };
  nat.addEventListener('input', refresh);

  const save = el('button', { class: 'btn primary', onclick: () => {
    const key = pad4(nat.value);
    if (!key) { alert('A national number is required.'); return; }
    if (!pad4(regional.value)) { alert('A regional number is required.'); return; }
    upsertMappingRow(mappingDex, { regional_no: regional.value, national_no: key });
    editing.mappings = null;
    render(root);
  } }, editing.mappings ? 'Save changes' : 'Add mapping');

  const card = formCard(
    editing.mappings ? `Edit ${p.regional_no} → ${p.national_no}` : `Add mapping to ${mappingDex}`,
    [regional, nat],
    save, () => { editing.mappings = null; render(root); }, !!editing.mappings, preview,
  );
  refresh();
  return card;
}

// ---- Games ------------------------------------------------------------------
function renderGames(wrap, root) {
  wrap.appendChild(buildGameForm(root));

  const q = filters.games.trim().toLowerCase();
  const all = REF.games;
  const matched = q ? all.filter((g) => (g.id || '').toLowerCase().includes(q) || (g.mark_code || '').toLowerCase().includes(q)) : all;
  const rows = matched.slice(0, ROW_LIMIT);

  wrap.appendChild(el('div', { class: 'dev-filter' }, [filterInput(root), limitNote(rows.length, matched.length)]));

  const headers = ['Id', 'Icon', 'Mark', 'Mark code', ''];
  const body = rows.map((g) => [
    g.id || '',
    el('td', {}, g.icon_url ? icon(g.icon_url, 'origin-icon', g.id) : el('span', { class: 'muted' }, '—')),
    el('td', {}, g.mark_url ? icon(g.mark_url, 'origin-icon', g.id) : el('span', { class: 'muted' }, '—')),
    { c: 'mono', v: g.mark_code || '' },
    rowActions(
      () => { editing.games = g; render(root); },
      () => { if (confirm(`Remove game "${g.id}"? OT registry rows that reference it will lose their origin imagery.`)) { if (editing.games === g) editing.games = null; removeGame(g.id); render(root); } },
    ),
  ]);
  wrap.appendChild(el('div', { class: 'table-wrap' }, dataTable(headers, body)));
}

function buildGameForm(root) {
  const p = editing.games || {};
  const id = el('input', { class: 'ctrl', placeholder: 'Id (e.g. Scarlet)', value: p.id || '' });
  const markCode = el('input', { class: 'ctrl', placeholder: 'Mark code', value: p.mark_code || '' });
  const iconUrl = el('input', { class: 'ctrl wide', placeholder: 'Icon URL', value: p.icon_url || '' });
  const markUrl = el('input', { class: 'ctrl wide', placeholder: 'Mark URL', value: p.mark_url || '' });

  // Live preview of the icon + mark images for the typed URLs.
  const preview = el('span', { class: 'origin-preview' });
  const refresh = () => {
    clear(preview);
    if (iconUrl.value.trim()) preview.appendChild(icon(iconUrl.value.trim(), 'origin-icon', 'icon'));
    if (markUrl.value.trim()) preview.appendChild(icon(markUrl.value.trim(), 'origin-icon', 'mark'));
    if (!iconUrl.value.trim() && !markUrl.value.trim()) preview.appendChild(el('span', { class: 'muted small' }, 'No imagery'));
  };
  iconUrl.addEventListener('input', refresh);
  markUrl.addEventListener('input', refresh);

  const save = el('button', { class: 'btn primary', onclick: () => {
    if (!id.value.trim()) { alert('A game id is required.'); return; }
    if (editing.games && editing.games.id !== id.value.trim() && REF.games.some((g) => g.id === id.value.trim())) {
      alert('Another game already uses that id.'); return;
    }
    upsertGame({
      id: id.value.trim(),
      icon_url: iconUrl.value.trim() || null,
      mark_url: markUrl.value.trim() || null,
      mark_code: markCode.value.trim() || null,
    });
    editing.games = null;
    render(root);
  } }, editing.games ? 'Save changes' : 'Add game');

  const card = formCard(
    editing.games ? `Edit ${p.id || ''}` : 'Add / update game',
    [id, markCode, iconUrl, markUrl],
    save, () => { editing.games = null; render(root); }, !!editing.games, preview,
  );
  refresh();
  return card;
}

// ---- Sprite sources (image_sources) -----------------------------------------
// A source is a named bundle of per-variant URL templates ({prefix, suffix}). The
// editor picks a source, then CRUDs its variant rows — mirroring the dex-mappings UI.
function renderSources(wrap, root) {
  const names = Object.keys(REF.imageSources);
  if (!srcName || !names.includes(srcName)) srcName = names[0] || null;

  const picker = el('select', { class: 'ctrl', onchange: (e) => { srcName = e.target.value; editing.sources = null; render(root); } },
    names.map((n) => el('option', { value: n, selected: n === srcName ? '' : null }, n)));
  const newName = el('input', { class: 'ctrl', placeholder: 'New source name' });
  wrap.appendChild(el('div', { class: 'card dev-mapping-head' }, [
    el('span', { class: 'field-label' }, 'Source'), picker,
    srcName ? el('button', { class: 'btn tiny', title: 'Rename source', onclick: () => {
      const nn = prompt('Rename sprite source', srcName);
      if (nn && nn.trim() && nn.trim() !== srcName) {
        if (REF.imageSources[nn.trim()]) { alert('A source with that name already exists.'); return; }
        renameImageSource(srcName, nn.trim()); srcName = nn.trim(); render(root);
      }
    } }, '✎ rename') : null,
    srcName ? el('button', { class: 'btn tiny', title: 'Delete source', onclick: () => {
      const used = REF.dexes.filter((d) => d.sprite_source === srcName).map((d) => d.id);
      if (confirm(`Delete sprite source "${srcName}"?` + (used.length ? `\nDexes still using it: ${used.join(', ')}` : ''))) {
        removeImageSource(srcName); srcName = null; editing.sources = null; render(root);
      }
    } }, '✕ delete') : null,
    el('span', { class: 'field-label' }, 'Sample #'),
    el('input', { class: 'ctrl dev-sample-input', value: sampleNo, placeholder: '025', title: 'National # used for preview thumbnails',
      oninput: (e) => { sampleNo = e.target.value; refocusSel = '.dev-sample-input'; render(root); } }),
    el('span', { class: 'spacer' }),
    newName,
    el('button', { class: 'btn', onclick: () => {
      const n = newName.value.trim();
      if (!n) { alert('Enter a source name.'); return; }
      if (REF.imageSources[n]) { alert('That source already exists.'); return; }
      addImageSource(n); srcName = n; render(root);
    } }, '＋ Add source'),
  ]));

  if (!srcName) {
    wrap.appendChild(el('p', { class: 'muted' }, 'No sprite sources. Add one above.'));
    return;
  }

  wrap.appendChild(buildVariantForm(root));

  const variants = Object.entries(REF.imageSources[srcName] || {});
  const headers = ['Variant', 'Prefix', 'Suffix', 'Preview', ''];
  const body = variants.map(([v, tpl]) => {
    const url = sampleUrl(tpl.prefix, tpl.suffix);
    return [
    { c: 'mono', v },
    { c: 'mono small', v: tpl.prefix || '' },
    { c: 'mono small', v: tpl.suffix || '' },
    el('td', {}, url ? el('img', { class: 'hof-img preview', src: url, alt: '', title: `#${pad3(sampleNo)} sample` }) : el('span', { class: 'muted' }, '—')),
    rowActions(
      () => { editing.sources = { variant: v, ...tpl }; render(root); },
      () => { if (confirm(`Remove variant "${v}" from ${srcName}?`)) { if (editing.sources && editing.sources.variant === v) editing.sources = null; removeImageVariant(srcName, v); render(root); } },
    ),
    ];
  });
  wrap.appendChild(el('div', { class: 'table-wrap' }, dataTable(headers, body)));
}

function buildVariantForm(root) {
  const p = editing.sources || {};
  const variant = el('input', { class: 'ctrl', placeholder: 'Variant (e.g. normal)', value: p.variant || '' });
  const prefix = el('input', { class: 'ctrl wide', placeholder: 'URL prefix', value: p.prefix || '' });
  const suffix = el('input', { class: 'ctrl', placeholder: 'URL suffix (e.g. .png)', value: p.suffix || '' });

  const preview = el('span', { class: 'origin-preview' });
  const refresh = () => {
    clear(preview);
    const url = sampleUrl(prefix.value.trim(), suffix.value.trim());
    if (url) {
      preview.appendChild(el('img', { class: 'hof-img preview', src: url, alt: '' }));
      preview.appendChild(el('span', { class: 'muted small' }, `sample #${pad3(sampleNo)}`));
    } else {
      preview.appendChild(el('span', { class: 'muted small' }, 'Fill prefix, suffix and Sample # to preview'));
    }
  };
  prefix.addEventListener('input', refresh);
  suffix.addEventListener('input', refresh);

  const save = el('button', { class: 'btn primary', onclick: () => {
    if (!variant.value.trim()) { alert('A variant name is required.'); return; }
    setImageVariant(srcName, variant.value.trim(), prefix.value.trim(), suffix.value.trim());
    editing.sources = null;
    render(root);
  } }, editing.sources ? 'Save changes' : 'Add variant');

  const card = formCard(
    editing.sources ? `Edit ${srcName} / ${p.variant || ''}` : `Add variant to ${srcName}`,
    [variant, prefix, suffix],
    save, () => { editing.sources = null; render(root); }, !!editing.sources, preview,
  );
  refresh();
  return card;
}

// ---- Shared bits ------------------------------------------------------------
function labeled(text, control) {
  return el('label', { class: 'field' }, [el('span', { class: 'field-label' }, text), control]);
}

function rowActions(onEdit, onRemove) {
  return el('td', { class: 'row-actions' }, [
    el('button', { class: 'btn tiny', title: 'Edit', onclick: onEdit }, '✎'),
    el('button', { class: 'btn tiny', title: 'Remove', onclick: onRemove }, '✕'),
  ]);
}

function formCard(heading, controls, saveBtn, onCancel, isEditing, footLeft) {
  return el('div', { class: 'card add-form' }, [
    el('h3', {}, heading),
    el('div', { class: 'add-grid' }, controls),
    el('div', { class: 'form-foot' }, [
      footLeft || el('span', { class: 'spacer' }),
      footLeft ? el('span', { class: 'spacer' }) : null,
      isEditing ? el('button', { class: 'btn', onclick: onCancel }, 'Cancel') : null,
      saveBtn,
    ]),
  ]);
}
