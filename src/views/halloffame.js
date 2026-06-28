// Hall of Fame — champion teams grouped by run (SPEC §4.5 / §8).
// Each team is one champion run; the same game can have several distinct teams.
import { REF, spriteUrl, speciesName, findGame, gamesAlpha } from '../data.js';
import * as store from '../store.js';
import { resolveOrigin } from '../compute.js';
import { el, clear, icon } from '../dom.js';

// Form context: null = add a brand-new team; { type:'edit', row } edits a mon;
// { type:'add', team } adds a mon to an existing team.
let formCtx = null;

const GAME_LIST_ID = 'hof-game-list';

let teamSeq = 0;
function newTeamId() { return `t_${Date.now().toString(36)}_${(teamSeq++).toString(36)}`; }

// Normalize a typed national number ("254", "0254", "#254") to the 4-digit key.
function padNat(v) {
  const digits = String(v || '').replace(/\D/g, '');
  return digits ? digits.padStart(4, '0') : '';
}

// Group rows into teams by team_id, preserving first-seen order. Each team's
// header info (game/ot/tid) comes from its first member.
function groupTeams(rows) {
  const order = [], byId = new Map();
  rows.forEach((r) => {
    const id = r.team_id || `g:${r.game || 'Unknown'}`;
    if (!byId.has(id)) { byId.set(id, { team_id: id, game: r.game, ot: r.ot, tid: r.tid, members: [] }); order.push(id); }
    byId.get(id).members.push(r);
  });
  return order.map((id) => byId.get(id));
}

export function render(root) {
  clear(root);
  const wrap = el('div', { class: 'hof' });

  // The form follows its context: when editing a mon or adding to a team it
  // appears right below that team; otherwise (new team) it sits at the bottom.
  const formTeamId = formCtx && formCtx.type === 'add' ? formCtx.team.team_id
    : formCtx && formCtx.type === 'edit' ? (formCtx.row.team_id || `g:${formCtx.row.game || 'Unknown'}`)
    : null;

  const teams = groupTeams(store.state.hall_of_fame || []);
  if (!teams.length) {
    wrap.appendChild(el('p', { class: 'muted' }, 'No Hall of Fame teams yet. Add your first champion team below.'));
  }

  teams.forEach((t) => {
    const card = el('div', { class: 'card hof-team' });
    const game = findGame(t.game);
    card.appendChild(el('div', { class: 'hof-team-head' }, [
      el('h3', { class: 'hof-title' }, [
        game && game.icon_url ? icon(game.icon_url, 'src-icon', t.game) : null,
        el('span', {}, t.game || 'Unknown'),
      ]),
      t.members.length >= 6
        ? el('span', { class: 'muted small', title: 'A team can hold at most 6 Pokémon' }, 'Full (6/6)')
        : el('button', { class: 'btn tiny', title: 'Add Pokémon to this team',
            onclick: () => { formCtx = { type: 'add', team: t }; render(root); } }, '＋ Add'),
    ]));
    const team = el('div', { class: 'hof-roster' });
    t.members.forEach((m, mi) => {
      const o = resolveOrigin(m.ot, m.tid);
      team.appendChild(el('div', { class: 'hof-mon' }, [
        el('div', { class: 'hof-mon-actions' }, [
          el('button', { class: 'btn tiny', title: 'Move earlier', disabled: mi === 0 || null, onclick: () => { store.swapHofEntries(m, t.members[mi - 1]); render(root); } }, '◀'),
          el('button', { class: 'btn tiny', title: 'Move later', disabled: mi === t.members.length - 1 || null, onclick: () => { store.swapHofEntries(m, t.members[mi + 1]); render(root); } }, '▶'),
          el('button', { class: 'btn tiny', title: 'Edit', onclick: () => { formCtx = { type: 'edit', row: m }; render(root); } }, '✎'),
          el('button', { class: 'btn tiny', title: 'Remove', onclick: () => { if (confirm(`Remove ${m.nickname || m.species} from ${t.game}?`)) { if (formCtx && formCtx.row === m) formCtx = null; store.removeHofEntry(m); render(root); } } }, '✕'),
        ]),
        el('img', { class: 'hof-img', loading: 'lazy', src: spriteUrl('home', m.shiny ? 'shiny' : 'normal', m.national_no, m.form_code || ''), alt: m.species }),
        el('div', { class: 'hof-name' }, [
          m.nickname || m.species,
          m.shiny ? el('span', { class: 'badge shiny' }, '✦') : null,
        ]),
        el('div', { class: 'muted small' }, `#${parseInt(m.national_no, 10)} · ${m.form ? m.form + ' ' : ''}${m.species}`),
        el('div', { class: 'muted small' }, `OT ${m.ot || '—'} / ${m.tid || '—'}`),
        o.markUrl ? icon(o.markUrl, 'cell-mark inline', o.markCode || '') : null,
      ]));
    });
    card.appendChild(team);
    wrap.appendChild(card);
    // Inline edit/add form right under the team it concerns.
    if (formTeamId && t.team_id === formTeamId) wrap.appendChild(buildForm(root));
  });

  // New-team form lives at the bottom.
  if (!formTeamId) wrap.appendChild(buildForm(root));
  root.appendChild(wrap);
}

function buildForm(root) {
  const editing = formCtx && formCtx.type === 'edit' ? formCtx.row : null;
  const addTeam = formCtx && formCtx.type === 'add' ? formCtx.team : null;
  // Prefill from the edited row, or from the team we're adding to.
  const p = editing || addTeam || {};

  const game = el('input', { class: 'ctrl', placeholder: 'Game', value: p.game || '', list: GAME_LIST_ID });
  const nat = el('input', { class: 'ctrl', placeholder: 'Nat #', value: editing && editing.national_no ? String(parseInt(editing.national_no, 10)) : '' });
  const nickname = el('input', { class: 'ctrl', placeholder: 'Nickname (optional)', value: (editing && editing.nickname) || '' });
  const ot = el('input', { class: 'ctrl', placeholder: 'OT', value: p.ot || '' });
  const tid = el('input', { class: 'ctrl', placeholder: 'TID', value: p.tid || '' });
  const formSel = el('select', { class: 'ctrl', title: 'Form' });
  const shiny = el('input', { type: 'checkbox', checked: editing && editing.shiny ? '' : null });

  // The available forms depend on the national number, so the dropdown is rebuilt
  // whenever it changes. The current selection is preserved if still valid.
  const rebuildForms = (preferCode) => {
    const key = padNat(nat.value);
    const forms = key ? REF.forms.filter((f) => f.national_no === key) : [];
    const keep = preferCode != null ? preferCode : formSel.value;
    clear(formSel);
    formSel.appendChild(el('option', { value: '' }, 'Base form'));
    forms.forEach((f) => formSel.appendChild(el('option', { value: f.form_code, selected: f.form_code === keep ? '' : null }, f.form)));
    formSel.disabled = forms.length ? null : '';
  };

  // Live preview of the resolved species + sprite for the typed national number.
  const preview = el('span', { class: 'origin-preview' });
  const refresh = () => {
    rebuildForms();
    clear(preview);
    const key = padNat(nat.value);
    const name = key ? speciesName(key) : '';
    const variant = shiny.checked ? 'shiny' : 'normal';
    if (key) preview.appendChild(el('img', { class: 'hof-img preview', src: spriteUrl('home', variant, key, formSel.value), alt: name }));
    preview.appendChild(el('span', { class: 'muted small' }, key ? `#${parseInt(key, 10)} ${name}` : 'Enter a national number'));
  };
  nat.addEventListener('input', refresh);
  formSel.addEventListener('change', refresh);
  shiny.addEventListener('change', refresh);

  const save = el('button', { class: 'btn primary', onclick: () => {
    const key = padNat(nat.value);
    if (!key) { alert('A national number is required.'); return; }
    if (!game.value.trim()) { alert('A game is required.'); return; }
    if (addTeam) {
      const count = (store.state.hall_of_fame || []).filter((r) => (r.team_id || `g:${r.game || 'Unknown'}`) === addTeam.team_id).length;
      if (count >= 6) { alert('A team can hold at most 6 Pokémon.'); return; }
    }
    const species = speciesName(key);
    const formCode = formSel.value;
    const formObj = formCode ? REF.forms.find((f) => f.national_no === key && f.form_code === formCode) : null;
    const fields = {
      game: game.value.trim(),
      national_no: key,
      name: species,
      species,
      nickname: nickname.value.trim() || null,
      ot: ot.value.trim(),
      tid: tid.value.trim(),
      form: formObj ? formObj.form : '',
      form_code: formCode,
      shiny: shiny.checked,
    };
    if (editing) {
      store.updateHofEntry(editing, fields);
    } else {
      // Reuse the target team's id when adding to one; otherwise start a new team.
      fields.team_id = addTeam ? addTeam.team_id : newTeamId();
      store.addHofEntry(fields);
    }
    formCtx = null;
    render(root);
  } }, editing ? 'Save changes' : 'Add to Hall of Fame');

  const heading = editing ? `Edit ${p.species || ''}`
    : addTeam ? `Add to ${addTeam.game || 'team'}`
    : 'Add champion team';

  const card = el('div', { class: 'card add-form' }, [
    el('datalist', { id: GAME_LIST_ID }, gamesAlpha().map((g) => el('option', { value: g.id }))),
    el('h3', {}, heading),
    el('div', { class: 'add-grid' }, [
      game, nat, formSel, nickname, ot, tid,
      el('label', { class: 'toggle' }, [shiny, el('span', {}, '✦ Shiny')]),
    ]),
    el('div', { class: 'form-foot' }, [
      preview,
      el('span', { class: 'spacer' }),
      formCtx ? el('button', { class: 'btn', onclick: () => { formCtx = null; render(root); } }, 'Cancel') : null,
      save,
    ]),
  ]);
  rebuildForms(editing && editing.form_code ? editing.form_code : '');
  refresh();
  return card;
}
