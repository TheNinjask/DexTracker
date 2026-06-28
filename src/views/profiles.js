// Switch profile / save manager (SPEC §4.6 / §8). Credentials masked by default (§10.2).
import { REF } from '../data.js';
import * as store from '../store.js';
import { el, clear } from '../dom.js';

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
  ]));

  wrap.appendChild(buildForm(root));

  if (!rows.length) {
    wrap.appendChild(el('p', { class: 'muted' }, 'No Switch profiles yet. Add one above.'));
    root.appendChild(wrap);
    return;
  }

  const table = el('table', { class: 'data-table' });
  table.appendChild(el('tr', {}, ['Profile', 'Game', 'Email', 'Password', 'Info', ''].map((h) => el('th', {}, h))));
  rows.forEach((p) => {
    table.appendChild(el('tr', {}, [
      el('td', {}, p.profile || ''),
      el('td', {}, p.game || ''),
      el('td', { class: 'mono' }, reveal ? (p.email || '') : mask(p.email)),
      el('td', { class: 'mono' }, p.password ? (reveal ? p.password : '••••••••') : el('span', { class: 'muted' }, '—')),
      el('td', { class: 'muted small' }, p.info || ''),
      el('td', { class: 'row-actions' }, [
        el('button', { class: 'btn tiny', title: 'Edit', onclick: () => { editing = p; render(root); } }, '✎'),
        el('button', { class: 'btn tiny', title: 'Remove', onclick: () => { if (confirm(`Remove profile ${p.profile || ''}${p.game ? ' / ' + p.game : ''}?`)) { if (editing === p) editing = null; store.removeProfile(p); render(root); } } }, '✕'),
      ]),
    ]));
  });
  wrap.appendChild(table);
  root.appendChild(wrap);
}

function buildForm(root) {
  const p = editing || {};
  const profile = el('input', { class: 'ctrl', placeholder: 'Profile', value: p.profile || '' });
  const game = el('input', { class: 'ctrl', placeholder: 'Game', value: p.game || '', list: GAME_LIST_ID });
  const email = el('input', { class: 'ctrl', placeholder: 'Email', value: p.email || '' });
  const password = el('input', { class: 'ctrl', type: reveal ? 'text' : 'password', placeholder: 'Password', value: p.password || '' });
  const info = el('input', { class: 'ctrl wide', placeholder: 'Info', value: p.info || '' });

  const save = el('button', { class: 'btn primary', onclick: () => {
    if (!profile.value.trim()) { alert('A profile name is required.'); return; }
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
    render(root);
  } }, editing ? 'Save changes' : 'Add profile');

  const card = el('div', { class: 'card add-form' }, [
    el('datalist', { id: GAME_LIST_ID }, REF.games.map((g) => el('option', { value: g.id }))),
    el('h3', {}, editing ? `Edit ${p.profile || ''}${p.game ? ' / ' + p.game : ''}` : 'Add profile'),
    el('div', { class: 'add-grid' }, [
      profile, game, email, password, info,
    ]),
    el('div', { class: 'form-foot' }, [
      el('span', { class: 'spacer' }),
      editing ? el('button', { class: 'btn', onclick: () => { editing = null; render(root); } }, 'Cancel') : null,
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
