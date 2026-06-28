// OT registry editor (SPEC §4.4). The join table turning (OT,TID) into origin metadata.
import { REF, findGame } from '../data.js';
import { resolveOrigin } from '../compute.js';
import * as store from '../store.js';
import { el, clear, icon, dataTable } from '../dom.js';

// Row currently loaded into the form for editing (null = add mode).
let editing = null;

export function render(root) {
  clear(root);
  const wrap = el('div', { class: 'registry' });
  wrap.appendChild(el('p', { class: 'muted' }, 'Every distinct trainer/source you\'ve caught from. A catch whose OT+TID isn\'t here shows origin N/A. The Origin icon and Mark default to the chosen game — override either by borrowing another game\'s.'));

  wrap.appendChild(buildForm(root));

  const rows = store.state.ot_registry || [];
  const headers = ['OT', 'TID', 'Game', 'Origin', 'Mark', 'isMine', 'isGo', 'Profile', 'Description', ''];
  const body = rows.map((r) => {
    const o = resolveOrigin(r.ot, r.tid);
    return [
      { c: 'mono', v: r.ot },
      { c: 'mono', v: r.tid },
      el('td', {}, r.game || el('span', { class: 'muted' }, '—')),
      assetCell(o.iconUrl, r.icon_game),
      assetCell(o.markUrl, r.mark_game),
      r.is_mine ? '✓' : '',
      r.is_go ? 'GO' : '',
      { c: 'muted small', v: r.profile || '' },
      { c: 'muted small', v: r.description || '' },
      el('td', { class: 'row-actions' }, [
        el('button', { class: 'btn tiny', title: 'Edit', onclick: () => { editing = r; render(root); } }, '✎'),
        el('button', { class: 'btn tiny', title: 'Remove', onclick: () => { if (confirm(`Remove ${r.ot}/${r.tid}?`)) { if (editing === r) editing = null; store.removeOtEntry(r.ot, r.tid); render(root); } } }, '✕'),
      ]),
    ];
  });
  wrap.appendChild(el('div', { class: 'table-wrap' }, dataTable(headers, body)));
  root.appendChild(wrap);
}

// A table cell showing a resolved icon/mark image plus a note of which game it
// was borrowed from when overridden.
function assetCell(url, overrideGame) {
  // Wrap icon + override note in one span so the card layout keeps them together
  // (icon immediately left of "↳ game") on the value side, not spread apart.
  return el('td', {}, el('span', { class: 'asset-val' }, [
    url ? icon(url, 'origin-icon', overrideGame || '') : el('span', { class: 'muted' }, '—'),
    overrideGame ? el('span', { class: 'muted small override-note' }, ` ↳ ${overrideGame}`) : null,
  ]));
}

const GAME_LIST_ID = 'reg-game-list';

// Free-text game field with autocomplete for known games. Unlike the icon/mark
// overrides (which must borrow a known reference game), the recorded origin can
// be anything — e.g. "Event" or "???" — so this must not be a closed dropdown.
function gameInput(value) {
  return el('input', { class: 'ctrl', placeholder: 'Game', value: value || '', list: GAME_LIST_ID });
}

function gameOptions(selected, placeholder) {
  return el('select', { class: 'ctrl' }, [
    el('option', { value: '' }, placeholder),
    ...REF.games.map((g) => el('option', { value: g.id, selected: g.id === selected ? '' : null }, g.id)),
  ]);
}

function labeled(text, control) {
  return el('label', { class: 'field' }, [el('span', { class: 'field-label' }, text), control]);
}

function buildForm(root) {
  const p = editing || {};
  const ot = el('input', { class: 'ctrl', placeholder: 'OT', value: p.ot || '' });
  const tid = el('input', { class: 'ctrl', placeholder: 'TID', value: p.tid || '' });
  const game = gameInput(p.game);
  const mine = el('input', { type: 'checkbox', checked: p.is_mine ? '' : null });
  const go = el('input', { type: 'checkbox', checked: p.is_go ? '' : null });
  const profile = el('input', { class: 'ctrl', placeholder: 'Profile', value: p.profile && p.profile !== 'N/A' ? p.profile : '' });
  const desc = el('input', { class: 'ctrl wide', placeholder: 'Description', value: p.description || '' });
  const iconGame = gameOptions(p.icon_game, '— origin: from game —');
  const markGame = gameOptions(p.mark_game, '— mark: from game —');

  // Live preview of the effective origin icon + mark for the current selections.
  const preview = el('span', { class: 'origin-preview' });
  const refresh = () => {
    clear(preview);
    const g = findGame(game.value);
    const ig = (iconGame.value && findGame(iconGame.value)) || g;
    const mg = (markGame.value && findGame(markGame.value)) || g;
    preview.appendChild(el('span', { class: 'muted small' }, 'Effective: '));
    preview.appendChild(ig && ig.icon_url ? icon(ig.icon_url, 'origin-icon', ig.id) : el('span', { class: 'muted small' }, 'no icon '));
    preview.appendChild(mg && mg.mark_url ? icon(mg.mark_url, 'origin-icon', mg.id) : el('span', { class: 'muted small' }, ' no mark'));
  };
  [game, iconGame, markGame].forEach((s) => s.addEventListener('change', refresh));

  const save = el('button', { class: 'btn primary', onclick: () => {
    if (!ot.value.trim() || !tid.value.trim()) { alert('OT and TID are required.'); return; }
    store.upsertOtEntry({
      ot: ot.value.trim(), tid: tid.value.trim(), game: game.value.trim(),
      is_mine: mine.checked, is_go: go.checked,
      profile: profile.value.trim() || 'N/A', description: desc.value.trim(),
      icon_game: iconGame.value || '', mark_game: markGame.value || '',
    });
    editing = null;
    render(root);
  } }, editing ? 'Save changes' : 'Save');

  const card = el('div', { class: 'card add-form' }, [
    el('datalist', { id: GAME_LIST_ID }, REF.games.map((g) => el('option', { value: g.id }))),
    el('h3', {}, editing ? `Edit ${p.ot}/${p.tid}` : 'Add / update trainer'),
    el('div', { class: 'add-grid' }, [
      ot, tid, game,
      el('label', { class: 'toggle' }, [mine, el('span', {}, 'isMine')]),
      el('label', { class: 'toggle' }, [go, el('span', {}, 'isGo')]),
      profile, desc,
      labeled('Origin icon', iconGame), labeled('Origin mark', markGame),
    ]),
    el('div', { class: 'form-foot' }, [
      preview,
      el('span', { class: 'spacer' }),
      editing ? el('button', { class: 'btn', onclick: () => { editing = null; render(root); } }, 'Cancel') : null,
      save,
    ]),
  ]);
  refresh();
  return card;
}
