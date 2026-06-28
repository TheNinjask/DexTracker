// Hall of Fame — champion teams grouped by game (SPEC §4.5 / §8).
import { REF, spriteUrl, speciesName, findGame } from '../data.js';
import * as store from '../store.js';
import { resolveOrigin } from '../compute.js';
import { el, clear, icon } from '../dom.js';

// Row currently loaded into the form for editing (null = add mode).
let editing = null;

const GAME_LIST_ID = 'hof-game-list';

// Normalize a typed national number ("254", "0254", "#254") to the 4-digit key.
function padNat(v) {
  const digits = String(v || '').replace(/\D/g, '');
  return digits ? digits.padStart(4, '0') : '';
}

export function render(root) {
  clear(root);
  const wrap = el('div', { class: 'hof' });
  wrap.appendChild(buildForm(root));

  const rows = store.state.hall_of_fame || [];
  if (!rows.length) {
    wrap.appendChild(el('p', { class: 'muted' }, 'No Hall of Fame teams yet. Add a champion above.'));
    root.appendChild(wrap);
    return;
  }

  // group by game preserving order
  const order = [], groups = new Map();
  rows.forEach((r) => { const g = r.game || 'Unknown'; if (!groups.has(g)) { groups.set(g, []); order.push(g); } groups.get(g).push(r); });

  order.forEach((g) => {
    const card = el('div', { class: 'card hof-team' });
    const game = findGame(g);
    card.appendChild(el('h3', { class: 'hof-title' }, [
      game && game.icon_url ? icon(game.icon_url, 'src-icon', g) : null,
      el('span', {}, g),
    ]));
    const team = el('div', { class: 'hof-roster' });
    groups.get(g).forEach((m) => {
      const o = resolveOrigin(m.ot, m.tid);
      team.appendChild(el('div', { class: 'hof-mon' }, [
        el('div', { class: 'hof-mon-actions' }, [
          el('button', { class: 'btn tiny', title: 'Edit', onclick: () => { editing = m; render(root); } }, '✎'),
          el('button', { class: 'btn tiny', title: 'Remove', onclick: () => { if (confirm(`Remove ${m.nickname || m.species} from ${g}?`)) { if (editing === m) editing = null; store.removeHofEntry(m); render(root); } } }, '✕'),
        ]),
        el('img', { class: 'hof-img', loading: 'lazy', src: spriteUrl('home', 'normal', m.national_no, ''), alt: m.species }),
        el('div', { class: 'hof-name' }, m.nickname || m.species),
        el('div', { class: 'muted small' }, `#${parseInt(m.national_no, 10)} · ${m.species}`),
        el('div', { class: 'muted small' }, `OT ${m.ot || '—'} / ${m.tid || '—'}`),
        o.markUrl ? icon(o.markUrl, 'cell-mark inline', o.markCode || '') : null,
      ]));
    });
    card.appendChild(team);
    wrap.appendChild(card);
  });
  root.appendChild(wrap);
}

function labeled(text, control) {
  return el('label', { class: 'field' }, [el('span', { class: 'field-label' }, text), control]);
}

function buildForm(root) {
  const p = editing || {};
  const game = el('input', { class: 'ctrl', placeholder: 'Game', value: p.game || '', list: GAME_LIST_ID });
  const nat = el('input', { class: 'ctrl', placeholder: 'Nat #', value: p.national_no ? String(parseInt(p.national_no, 10)) : '' });
  const nickname = el('input', { class: 'ctrl', placeholder: 'Nickname (optional)', value: p.nickname || '' });
  const ot = el('input', { class: 'ctrl', placeholder: 'OT', value: p.ot || '' });
  const tid = el('input', { class: 'ctrl', placeholder: 'TID', value: p.tid || '' });

  // Live preview of the resolved species + sprite for the typed national number.
  const preview = el('span', { class: 'origin-preview' });
  const refresh = () => {
    clear(preview);
    const key = padNat(nat.value);
    const name = key ? speciesName(key) : '';
    if (key) preview.appendChild(el('img', { class: 'hof-img preview', src: spriteUrl('home', 'normal', key, ''), alt: name }));
    preview.appendChild(el('span', { class: 'muted small' }, key ? `#${parseInt(key, 10)} ${name}` : 'Enter a national number'));
  };
  nat.addEventListener('input', refresh);

  const save = el('button', { class: 'btn primary', onclick: () => {
    const key = padNat(nat.value);
    if (!key) { alert('A national number is required.'); return; }
    if (!game.value.trim()) { alert('A game is required.'); return; }
    const species = speciesName(key);
    const entry = {
      game: game.value.trim(),
      national_no: key,
      name: species,
      species,
      nickname: nickname.value.trim() || null,
      ot: ot.value.trim(),
      tid: tid.value.trim(),
    };
    if (editing) store.updateHofEntry(editing, entry);
    else store.addHofEntry(entry);
    editing = null;
    render(root);
  } }, editing ? 'Save changes' : 'Add to Hall of Fame');

  const card = el('div', { class: 'card add-form' }, [
    el('datalist', { id: GAME_LIST_ID }, REF.games.map((g) => el('option', { value: g.id }))),
    el('h3', {}, editing ? `Edit ${p.species || ''}` : 'Add champion'),
    el('div', { class: 'add-grid' }, [
      game, nat, nickname, ot, tid,
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
