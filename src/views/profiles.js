// Switch profile / save manager (SPEC §4.6 / §8). Credentials masked by default (§10.2).
import { gamesAlpha } from '../data.js';
import * as store from '../store.js';
import { el, clear, dataTable, modal, alertDialog, confirmDialog } from '../dom.js';

let reveal = false;
// Row currently loaded into the form for editing (null = add mode).
let editing = null;

const GAME_LIST_ID = 'profile-game-list';

export function render(root) {
  clear(root);
  const wrap = el('div', { class: 'profiles' });
  const rows = store.state.switch_profiles || [];

  wrap.appendChild(el('div', { class: 'profiles-head' }, [
    el('label', { class: 'toggle' }, [
      el('input', { type: 'checkbox', checked: reveal || null, onchange: (e) => { reveal = e.target.checked; render(root); } }),
      el('span', {}, 'Reveal credentials'),
    ]),
    el('button', { class: 'btn primary', onclick: () => { editing = null; openForm(root); } }, '＋ Add profile'),
  ]));

  if (!rows.length) {
    wrap.appendChild(el('p', { class: 'muted' }, 'No Switch profiles yet. Add one above.'));
    root.appendChild(wrap);
    return;
  }

  const headers = ['Profile', 'Game', 'Email', 'Password', 'Info', ''];
  const body = rows.map((p) => [
    p.profile || '',
    p.game || '',
    { c: 'mono', v: reveal ? (p.email || '') : mask(p.email) },
    el('td', { class: 'mono' }, p.password ? (reveal ? p.password : '••••••••') : el('span', { class: 'muted' }, '—')),
    { c: 'muted small', v: p.info || '' },
    el('td', { class: 'row-actions' }, [
      el('button', { class: 'btn tiny', title: 'Edit', onclick: () => { editing = p; openForm(root); } }, '✎'),
      el('button', { class: 'btn tiny', title: 'Remove', onclick: async () => { if (await confirmDialog(`Remove profile ${p.profile || ''}${p.game ? ' / ' + p.game : ''}?`)) { if (editing === p) editing = null; store.removeProfile(p); render(root); } } }, '✕'),
    ]),
  ]);
  wrap.appendChild(el('div', { class: 'table-wrap' }, dataTable(headers, body)));

  root.appendChild(wrap);
}

// Opens the add/edit form in a dialog, same pattern as the OT Registry — a
// row's edit action is one click away no matter how far down the table it
// is, instead of an inline form pinned to a fixed spot.
function openForm(root) {
  const title = editing ? `Edit ${editing.profile || ''}${editing.game ? ' / ' + editing.game : ''}` : 'Add profile';
  const m = modal(title, [], () => { editing = null; });
  m.box.classList.add('form-modal');
  m.box.querySelector('.modal-body').appendChild(buildForm(root, m));
}

function buildForm(root, m) {
  const p = editing || {};
  const profile = el('input', { class: 'ctrl', placeholder: 'Profile', value: p.profile || '' });
  const game = el('input', { class: 'ctrl', placeholder: 'Game', value: p.game || '', list: GAME_LIST_ID });
  const email = el('input', { class: 'ctrl', placeholder: 'Email', value: p.email || '' });
  const password = el('input', { class: 'ctrl', type: reveal ? 'text' : 'password', placeholder: 'Password', value: p.password || '' });
  const info = el('input', { class: 'ctrl wide', placeholder: 'Info', value: p.info || '' });

  const save = el('button', { class: 'btn primary', onclick: () => {
    if (!profile.value.trim()) { alertDialog('A profile name is required.'); return; }
    const fields = {
      profile: profile.value.trim(),
      game: game.value.trim(),
      email: email.value.trim(),
      password: password.value || null,
      info: info.value.trim(),
    };
    if (editing) store.updateProfile(editing, fields);
    else store.addProfile(fields);
    editing = null;
    m.close();
    render(root);
  } }, editing ? 'Save changes' : 'Add profile');

  const card = el('div', { class: 'add-form' }, [
    el('datalist', { id: GAME_LIST_ID }, gamesAlpha().map((g) => el('option', { value: g.id }))),
    el('div', { class: 'add-grid' }, [
      profile, game, email, password, info,
    ]),
    el('div', { class: 'form-foot' }, [
      el('span', { class: 'spacer' }),
      el('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'),
      save,
    ]),
  ]);
  return card;
}

function mask(s) {
  if (!s) return '';
  const at = s.indexOf('@');
  if (at <= 1) return '•••' + (at >= 0 ? s.slice(at) : '');
  return s[0] + '•••' + s.slice(at);
}
