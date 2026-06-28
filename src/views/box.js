// Primary interface — HOME-style box grid (SPEC §7).
import { REF, idx } from '../data.js';
import * as store from '../store.js';
import { buildDexEntries, entrySlot, entryOwned, entrySprite, resolveOrigin } from '../compute.js';
import { el, clear, getPrefs, setPref, icon } from '../dom.js';

const vs = {
  dexId: getPrefs().boxDex || 'Nat Dex',
  mode: getPrefs().boxMode || 'regional',
  imgSrc: getPrefs().boxImgSrc || 'main', // 'main' = dex-native art, 'other' = swap normal<->shiny
  ntcTraded: getPrefs().ntcTraded || false, // "Next to catch" also lists owned-but-traded (not mine)
  ntcGo: getPrefs().ntcGo || false, // "Next to catch" also lists owned-but-from-GO
  page: 0,
  selectedKey: null,
};

// Sprite variant for the current Main/Other artwork swap (xlsx "Main Img
// Src"/"Other Img Src"). Each dex defines its own pair: game dexes are
// normal/shiny, but the HOME dexes are normal/art and shiny/normal — so this is
// read from the dex, not derived. Display only — never touches ownership.
function spriteVariant() {
  const d = built.dex || {};
  return vs.imgSrc === 'other' ? (d.other_variant || 'shiny') : (d.main_variant || 'normal');
}

let built = null; // { dex, entries, hasRegional, isForm }
let paged = null; // { pages:[[cell]], labels:[] }

function numOf(e, mode) {
  if (mode === 'national') return parseInt(e.national_no, 10);
  return e.regional_no != null ? parseInt(e.regional_no, 10) : NaN;
}

function packSequential(list) {
  const pages = [], labels = [];
  for (let i = 0; i < list.length; i += 30) {
    const cells = new Array(30).fill(null);
    list.slice(i, i + 30).forEach((e, j) => (cells[j] = e));
    pages.push(cells);
    labels.push(`Box ${Math.floor(i / 30) + 1}`);
  }
  if (pages.length === 0) { pages.push(new Array(30).fill(null)); labels.push('Box 1'); }
  return { pages, labels };
}

function paginate() {
  const { entries, isForm, hasRegional } = built;
  // Box layout uses the dex's own numbering (regional where available, else
  // national). The Regional/National mode toggle only affects No. search, not
  // how the boxes are laid out.
  const mode = hasRegional ? 'regional' : 'national';

  if (isForm) {
    const list = entries;
    const order = [], groups = new Map();
    list.forEach((e) => {
      const g = e.group || 'Forms';
      if (!groups.has(g)) { groups.set(g, []); order.push(g); }
      groups.get(g).push(e);
    });
    const pages = [], labels = [];
    order.forEach((g) => {
      const arr = groups.get(g);
      for (let i = 0; i < arr.length; i += 30) {
        const cells = new Array(30).fill(null);
        arr.slice(i, i + 30).forEach((e, j) => (cells[j] = e));
        pages.push(cells);
        labels.push(`${g} - Box ${Math.floor(i / 30) + 1}`);
      }
    });
    return pages.length ? { pages, labels } : packSequential([]);
  }

  const numbered = entries.filter((e) => !Number.isNaN(numOf(e, mode)));
  const unnumbered = entries.filter((e) => Number.isNaN(numOf(e, mode)));
  if (numbered.length === 0) return packSequential(unnumbered);

  const maxN = Math.max(...numbered.map((e) => numOf(e, mode)));
  const pageCount = Math.ceil(maxN / 30);
  const pages = [], labels = [];
  for (let p = 0; p < pageCount; p++) { pages.push(new Array(30).fill(null)); labels.push(`Box ${p + 1}`); }
  numbered.forEach((e) => {
    const i = numOf(e, mode) - 1;
    pages[Math.floor(i / 30)][i % 30] = e;
  });
  // trailing unnumbered entries fill remaining/extra boxes sequentially
  if (unnumbered.length) {
    let pi = pages.length - 1, free = pages[pi].filter((c) => c === null).length;
    unnumbered.forEach((e) => {
      let placed = false;
      for (let p = 0; p < pages.length && !placed; p++) {
        const slot = pages[p].indexOf(null);
        if (slot >= 0) { pages[p][slot] = e; placed = true; }
      }
      if (!placed) { const cells = new Array(30).fill(null); cells[0] = e; pages.push(cells); labels.push(`Box ${pages.length}`); }
    });
  }
  return { pages, labels };
}

function rebuild() {
  built = buildDexEntries(vs.dexId);
  paged = paginate();
  if (vs.page >= paged.pages.length) vs.page = 0;
}

// The ordered list of entries still "to catch": always the unowned ones, plus —
// when the Traded toggle is on — those owned but flagged not-mine (is_mine=false
// via the OT+TID registry), and — when the GO toggle is on — those owned but
// flagged as originating in Pokémon GO, so you can re-catch a "real" copy.
function nextToCatch() {
  const { entries, isForm, hasRegional } = built;
  const mode = hasRegional ? 'regional' : 'national';
  const list = isForm ? entries : [...entries].sort((a, b) => (numOf(a, mode) || 1e9) - (numOf(b, mode) || 1e9));
  const missing = list.filter((e) => {
    if (!entryOwned(e)) return true;
    if (!vs.ntcTraded && !vs.ntcGo) return false;
    const slot = entrySlot(e);
    const o = resolveOrigin(slot.ot, slot.tid);
    return (vs.ntcTraded && o.isMine === false) || (vs.ntcGo && o.isGo === true);
  });
  return { missing, total: entries.length };
}

export function render(root) {
  rebuild();
  clear(root);
  const layout = el('div', { class: 'box-layout' });
  layout.appendChild(buildControls(root));
  const main = el('div', { class: 'box-main' });
  main.appendChild(buildGrid(root));
  main.appendChild(buildSidebar(root));
  layout.appendChild(main);
  root.appendChild(layout);
}

function refresh(root) { render(root); }

function buildControls(root) {
  const bar = el('div', { class: 'controls' });

  const dexSel = el('select', { class: 'ctrl',
    onchange: (e) => { vs.dexId = e.target.value; setPref('boxDex', vs.dexId); vs.page = 0; vs.selectedKey = null; refresh(root); } },
    REF.dexes.map((d) => el('option', { value: d.id, selected: d.id === vs.dexId || null }, d.name)));
  bar.appendChild(field('Dex Of', dexSel));

  const modeSel = el('select', { class: 'ctrl', disabled: !built.hasRegional || null,
    onchange: (e) => { vs.mode = e.target.value; setPref('boxMode', vs.mode); refresh(root); } },
    [el('option', { value: 'regional', selected: vs.mode === 'regional' || null }, 'Regional'),
     el('option', { value: 'national', selected: vs.mode === 'national' || null }, 'National')]);
  bar.appendChild(field('Mode', modeSel));

  // Main/Other artwork swap (xlsx "Main Img Src"/"Other Img Src"): flips every
  // sprite in the box between its normal and shiny variant. Display only.
  const imgSel = el('select', { class: 'ctrl',
    onchange: (e) => { vs.imgSrc = e.target.value; setPref('boxImgSrc', vs.imgSrc); refresh(root); } },
    [el('option', { value: 'main', selected: vs.imgSrc === 'main' || null }, 'Main'),
     el('option', { value: 'other', selected: vs.imgSrc === 'other' || null }, 'Other')]);
  bar.appendChild(field('Sprites', imgSel));

  const numLabel = (built.hasRegional ? vs.mode : 'national') === 'national' ? 'Nat No.' : 'Reg No.';
  const search = el('input', { class: 'ctrl', type: 'search', placeholder: `${numLabel} or species…`,
    onkeydown: (e) => { if (e.key === 'Enter') doSearch(root, e.target.value); } });
  bar.appendChild(field('Search', search));

  return bar;
}

function field(label, control) {
  return el('div', { class: 'field' }, [el('label', { class: 'field-label' }, label), control]);
}

function doSearch(root, q) {
  q = (q || '').trim().toLowerCase();
  if (!q) return;
  const { entries, hasRegional } = built;
  const mode = hasRegional ? vs.mode : 'national';
  let match;
  if (/^\d+$/.test(q)) {
    // Numeric query → National No. or Regional No. depending on the mode toggle.
    const n = parseInt(q, 10);
    match = mode === 'national'
      ? entries.find((e) => parseInt(e.national_no, 10) === n)
      : entries.find((e) => e.regional_no != null && parseInt(e.regional_no, 10) === n);
  } else {
    match = entries.find((e) => e.name && e.name.toLowerCase().includes(q));
  }
  if (match) jumpTo(root, match);
}

function jumpTo(root, entry) {
  // find page containing this entry
  for (let p = 0; p < paged.pages.length; p++) {
    if (paged.pages[p].includes(entry)) { vs.page = p; break; }
  }
  vs.selectedKey = keyOf(entry);
  refresh(root);
}

function keyOf(e) { return `${e.dexId}|${e.national_no}|${e.formCode}|${e.shiny}|${e.form || ''}`; }

function buildGrid(root) {
  const wrap = el('div', { class: 'grid-wrap' });
  const page = paged.pages[vs.page] || [];

  const header = el('div', { class: 'grid-header' }, [
    el('button', { class: 'pgbtn', disabled: vs.page === 0 || null, onclick: () => { vs.page--; refresh(root); } }, '‹'),
    el('div', { class: 'grid-title' }, [
      el('span', { class: 'box-label' }, paged.labels[vs.page] || `Box ${vs.page + 1}`),
      el('span', { class: 'page-of' }, `Page ${vs.page + 1} of ${paged.pages.length}`),
    ]),
    el('button', { class: 'pgbtn', disabled: vs.page >= paged.pages.length - 1 || null, onclick: () => { vs.page++; refresh(root); } }, '›'),
  ]);
  wrap.appendChild(header);

  const grid = el('div', { class: 'box-grid' });
  for (let i = 0; i < 30; i++) {
    const e = page[i];
    grid.appendChild(buildCell(root, e, i));
  }
  wrap.appendChild(grid);
  return wrap;
}

function buildCell(root, e, i) {
  if (!e) return el('div', { class: 'cell empty' }, el('span', { class: 'cell-pos' }, i + 1));
  const owned = entryOwned(e);
  const selected = vs.selectedKey === keyOf(e);
  const cell = el('div', {
    class: `cell ${owned ? 'owned' : 'missing'} ${selected ? 'selected' : ''}`,
    title: `#${parseInt(e.national_no, 10)} ${e.name}`,
    onclick: () => { vs.selectedKey = keyOf(e); refresh(root); },
  });
  const img = el('img', { class: 'cell-img', loading: 'lazy', alt: e.name, src: entrySprite(e, spriteVariant()) });
  img.addEventListener('error', () => img.classList.add('broken'));
  cell.appendChild(img);
  if (owned) {
    const slot = entrySlot(e);
    const o = resolveOrigin(slot.ot, slot.tid);
    if (o.markUrl) cell.appendChild(icon(o.markUrl, 'cell-mark', o.markCode || ''));
  }
  cell.appendChild(el('span', { class: 'cell-no' }, '#' + parseInt(e.national_no, 10)));
  return cell;
}

function buildSidebar(root) {
  const side = el('div', { class: 'box-sidebar' });

  // Next to catch — browse every still-missing entry with ‹ ›.
  const { missing, total } = nextToCatch();
  const ntcBox = el('div', { class: 'card ntc' });
  ntcBox.appendChild(el('div', { class: 'ntc-head' }, [
    el('h3', {}, 'Next to catch'),
    el('label', { class: 'toggle ntc-toggle' }, [
      el('input', { type: 'checkbox', checked: vs.ntcTraded || null,
        onchange: (ev) => { vs.ntcTraded = ev.target.checked; setPref('ntcTraded', vs.ntcTraded); refresh(root); } }),
      el('span', {}, 'Include traded'),
    ]),
    el('label', { class: 'toggle ntc-toggle' }, [
      el('input', { type: 'checkbox', checked: vs.ntcGo || null,
        onchange: (ev) => { vs.ntcGo = ev.target.checked; setPref('ntcGo', vs.ntcGo); refresh(root); } }),
      el('span', {}, 'Include from GO'),
    ]),
  ]));
  if (missing.length) {
    // Anchor the browse position to the current selection when it's one of the
    // missing; otherwise start at the first. ‹ › jump the box to the neighbour.
    let idx = missing.findIndex((e) => keyOf(e) === vs.selectedKey);
    if (idx < 0) idx = 0;
    const n = missing[idx];
    ntcBox.appendChild(el('div', { class: 'ntc-row', onclick: () => jumpTo(root, n) }, [
      el('img', { class: 'ntc-img', src: entrySprite(n, spriteVariant()), alt: n.name }),
      el('div', {}, [
        el('div', { class: 'ntc-name' }, n.name),
        el('div', { class: 'muted' }, '#' + parseInt(n.national_no, 10)),
      ]),
    ]));
    ntcBox.appendChild(el('div', { class: 'ntc-nav' }, [
      el('button', { class: 'pgbtn', disabled: idx === 0 || null, onclick: () => jumpTo(root, missing[idx - 1]) }, '‹'),
      el('span', { class: 'muted' }, `${idx + 1} of ${missing.length} missing · ${total} total`),
      el('button', { class: 'pgbtn', disabled: idx >= missing.length - 1 || null, onclick: () => jumpTo(root, missing[idx + 1]) }, '›'),
    ]));
  } else {
    ntcBox.appendChild(el('div', { class: 'done' }, `Complete! ${total}/${total}`));
  }
  side.appendChild(ntcBox);

  // Detail / edit panel
  const sel = vs.selectedKey ? (paged.pages[vs.page].find((e) => e && keyOf(e) === vs.selectedKey)
                || built.entries.find((e) => keyOf(e) === vs.selectedKey)) : null;
  side.appendChild(buildDetail(root, sel));
  return side;
}

function buildDetail(root, e) {
  const card = el('div', { class: 'card detail' });
  if (!e) { card.appendChild(el('p', { class: 'muted' }, 'Select a Pokémon to view / edit.')); return card; }

  const slot = entrySlot(e) || {};
  const owned = store.isOwned(slot);
  const o = owned ? resolveOrigin(slot.ot, slot.tid) : null;

  card.appendChild(el('div', { class: 'detail-head' }, [
    el('img', { class: 'detail-img', src: entrySprite(e, spriteVariant()), alt: e.name }),
    el('div', {}, [
      el('h3', {}, e.name),
      el('div', { class: 'muted' }, `Nat #${parseInt(e.national_no, 10)}` + (e.regional_no ? ` · Reg #${parseInt(e.regional_no, 10)}` : '')),
      e.shiny ? el('span', { class: 'badge shiny' }, '✦ Shiny') : null,
    ]),
  ]));

  const otIn = el('input', { class: 'ctrl', value: slot.ot || '', placeholder: 'OT' });
  const tidIn = el('input', { class: 'ctrl', value: slot.tid || '', placeholder: 'TID' });
  const form = el('div', { class: 'edit-form' }, [
    field('OT', otIn), field('TID', tidIn),
  ]);
  card.appendChild(form);

  // Origin readout
  if (owned && o) {
    const orow = el('div', { class: 'origin' });
    if (o.iconUrl) orow.appendChild(icon(o.iconUrl, 'origin-icon', o.game || ''));
    orow.appendChild(el('span', {}, o.registered ? (o.game || 'N/A') : 'Unregistered OT'));
    if (o.isGo) orow.appendChild(el('span', { class: 'badge go' }, 'GO'));
    // isMine ("Caught by me") is derived from the OT+TID via the registry, never
    // set per-Pokémon. Shown for every dex (HOME, Shiny HOME, Form, Shiny Form,
    // per-game) whenever the OT is registered.
    if (o.registered) {
      orow.appendChild(o.isMine === false
        ? el('span', { class: 'badge' }, 'Traded')
        : el('span', { class: 'badge mine' }, '✓ Caught by me'));
    }
    card.appendChild(orow);
    if (!o.registered) {
      card.appendChild(el('div', { class: 'warn' }, `OT "${slot.ot}/${slot.tid}" not in registry → origin N/A. Add it in the Registry tab.`));
    }
  }

  card.appendChild(el('div', { class: 'detail-actions' }, [
    el('button', { class: 'btn primary', onclick: () => {
      const ot = otIn.value.trim(), tid = tidIn.value.trim();
      if (e.slotKind === 'species') store.setSpeciesSlot(e.national_no, e.shiny, ot, tid);
      else if (e.slotKind === 'form') store.setFormSlot(e.national_no, e.formCode, e.form, e.shiny, ot, tid);
      else {
        // is_mine is no longer user-set — derive it from the OT+TID registry entry.
        const reg = store.getOtEntry(ot, tid);
        store.setPerGameSlot(e.dexId, e.national_no, e.regional_no, ot, tid, reg ? reg.is_mine !== false : true);
      }
      maybePromptRegistry(ot, tid);
      refresh(root);
    } }, 'Save'),
    owned ? el('button', { class: 'btn', onclick: () => {
      if (e.slotKind === 'species') store.setSpeciesSlot(e.national_no, e.shiny, '', '');
      else if (e.slotKind === 'form') store.setFormSlot(e.national_no, e.formCode, e.form, e.shiny, '', '');
      else store.setPerGameSlot(e.dexId, e.national_no, e.regional_no, '', '', false);
      refresh(root);
    } }, 'Clear') : null,
    e.serebii_link ? el('a', { class: 'btn link', href: e.serebii_link, target: '_blank', rel: 'noopener' }, 'Serebii ↗') : null,
  ]));
  return card;
}

function maybePromptRegistry(ot, tid) {
  if (!ot || !tid) return;
  if (store.getOtEntry(ot, tid)) return;
  if (confirm(`OT "${ot}" / TID "${tid}" isn't in your trainer registry.\nAdd it now so origin resolves?`)) {
    store.upsertOtEntry({ ot, tid, is_mine: true, is_go: false, profile: 'N/A', game: '', description: '' });
  }
}
