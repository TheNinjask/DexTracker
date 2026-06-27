// OT registry editor (SPEC §4.4). The join table turning (OT,TID) into origin metadata.
import { REF } from '../data.js';
import * as store from '../store.js';
import { el, clear } from '../dom.js';

export function render(root) {
  clear(root);
  const wrap = el('div', { class: 'registry' });
  wrap.appendChild(el('p', { class: 'muted' }, 'Every distinct trainer/source you\'ve caught from. A catch whose OT+TID isn\'t here shows origin N/A.'));

  wrap.appendChild(buildAddForm(root));

  const rows = store.state.ot_registry || [];
  const table = el('table', { class: 'data-table' });
  table.appendChild(el('tr', {}, ['OT', 'TID', 'Game', 'isMine', 'isGo', 'Profile', 'Description', ''].map((h) => el('th', {}, h))));
  rows.forEach((r) => {
    table.appendChild(el('tr', {}, [
      el('td', { class: 'mono' }, r.ot),
      el('td', { class: 'mono' }, r.tid),
      el('td', {}, r.game || el('span', { class: 'muted' }, '—')),
      el('td', {}, r.is_mine ? '✓' : ''),
      el('td', {}, r.is_go ? 'GO' : ''),
      el('td', { class: 'muted small' }, r.profile || ''),
      el('td', { class: 'muted small' }, r.description || ''),
      el('td', {}, el('button', { class: 'btn tiny', onclick: () => { if (confirm(`Remove ${r.ot}/${r.tid}?`)) { store.removeOtEntry(r.ot, r.tid); render(root); } } }, '✕')),
    ]));
  });
  wrap.appendChild(table);
  root.appendChild(wrap);
}

function buildAddForm(root) {
  const ot = el('input', { class: 'ctrl', placeholder: 'OT' });
  const tid = el('input', { class: 'ctrl', placeholder: 'TID' });
  const game = el('select', { class: 'ctrl' }, [el('option', { value: '' }, '— game —'),
    ...REF.games.map((g) => el('option', { value: g.id }, g.id))]);
  const mine = el('input', { type: 'checkbox' });
  const go = el('input', { type: 'checkbox' });
  const profile = el('input', { class: 'ctrl', placeholder: 'Profile' });
  const desc = el('input', { class: 'ctrl wide', placeholder: 'Description' });
  const card = el('div', { class: 'card add-form' }, [
    el('h3', {}, 'Add / update trainer'),
    el('div', { class: 'add-grid' }, [ot, tid, game,
      el('label', { class: 'toggle' }, [mine, el('span', {}, 'isMine')]),
      el('label', { class: 'toggle' }, [go, el('span', {}, 'isGo')]),
      profile, desc,
      el('button', { class: 'btn primary', onclick: () => {
        if (!ot.value.trim() || !tid.value.trim()) { alert('OT and TID are required.'); return; }
        store.upsertOtEntry({ ot: ot.value.trim(), tid: tid.value.trim(), game: game.value,
          is_mine: mine.checked, is_go: go.checked, profile: profile.value.trim() || 'N/A', description: desc.value.trim() });
        render(root);
      } }, 'Save'),
    ]),
  ]);
  return card;
}
