// Switch profile / save manager (SPEC §4.6 / §8). Credentials masked by default (§10.2).
import { idx } from '../data.js';
import * as store from '../store.js';
import { el, clear } from '../dom.js';

let reveal = false;

export function render(root) {
  clear(root);
  const wrap = el('div', { class: 'profiles' });
  const rows = store.state.switch_profiles || [];

  wrap.appendChild(el('div', { class: 'profiles-head' }, [
    el('p', { class: 'warn' }, 'Credentials are secrets (SPEC §10.2). They are masked by default and stay only in your local savefile.'),
    el('label', { class: 'toggle' }, [
      el('input', { type: 'checkbox', checked: reveal || null, onchange: (e) => { reveal = e.target.checked; render(root); } }),
      el('span', {}, 'Reveal credentials'),
    ]),
  ]));

  if (!rows.length) { wrap.appendChild(el('p', { class: 'muted' }, 'No Switch profiles in this savefile.')); root.appendChild(wrap); return; }

  const table = el('table', { class: 'data-table' });
  table.appendChild(el('tr', {}, ['Profile', 'Game', 'Email', 'Password', 'Info'].map((h) => el('th', {}, h))));
  rows.forEach((p) => {
    table.appendChild(el('tr', {}, [
      el('td', {}, p.profile || ''),
      el('td', {}, p.game || ''),
      el('td', { class: 'mono' }, reveal ? (p.email || '') : mask(p.email)),
      el('td', { class: 'mono' }, p.password ? (reveal ? p.password : '••••••••') : el('span', { class: 'muted' }, '—')),
      el('td', { class: 'muted small' }, p.info || ''),
    ]));
  });
  wrap.appendChild(table);
  root.appendChild(wrap);
}

function mask(s) {
  if (!s) return '';
  const at = s.indexOf('@');
  if (at <= 1) return '•••' + (at >= 0 ? s.slice(at) : '');
  return s[0] + '•••' + s.slice(at);
}
