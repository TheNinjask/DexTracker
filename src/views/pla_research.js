// Pokémon Legends: Arceus's Hisuian Pokédex Research Level tracker (a Tools-tab
// tool, unrelated to the "Challenges & Research Tasks" nav tab — that one
// tracks Pokémon HOME's per-game overworld request tasks, this one tracks
// PLA's own per-species Pokédex research levels: several task categories,
// each with a few increasing count tiers, worth 10 or 20 research points per
// tier; level = min(10, floor(totalPoints/10)); "Perfect!" once every tier of
// every task for that species is done.
//
// Layout mirrors the in-game Hisuian Pokédex screen: a species list down the
// right (portraits + names, Hisui dex order — pla_research_data.json is
// already in that order), and a "Research Tasks for <name>" ledger on the
// left showing the selected species' tasks as a row per task with its tier
// thresholds, ticked ones replaced by a checkmark.
import { PLA_RESEARCH, spriteUrl } from '../data.js';
import * as store from '../store.js';
import { el, clear, icon } from '../dom.js';

let filter = 'all';
let search = '';
let selectedNo = null; // regional_no currently shown in the ledger panel

// "Not started" (0 points) isn't worth its own bucket — folded into
// "In progress" so the filter bar stays to the handful of states someone
// actually wants to jump between.
const FILTERS = [
  ['all', 'All'],
  ['in-progress', 'In progress'],
  ['complete', 'Complete!'],
  ['perfect', 'Perfect!'],
];

function taskPoints(task) { return task.boosted ? 20 : 10; }

// A tier is complete once the task's raw count (e.g. "times caught") reaches
// its threshold amount — same as the in-game Pokédex. Points/level are
// derived live from those counts, never stored — same reasoning as
// challenges.js's doneCount().
function speciesProgress(species) {
  let points = 0, doneTiers = 0, totalTiers = 0;
  species.tasks.forEach((t) => {
    const pts = taskPoints(t);
    const count = store.getPlaTaskCount(species.regional_no, t.category, t.label);
    t.tiers.forEach((amount) => {
      totalTiers++;
      if (count >= amount) { doneTiers++; points += pts; }
    });
  });
  return { points, level: Math.min(10, Math.floor(points / 10)), perfect: totalTiers > 0 && doneTiers === totalTiers };
}

function statusOf(progress) {
  if (progress.perfect) return 'perfect';
  if (progress.level >= 10) return 'complete';
  return 'in-progress';
}

function regionalNoLabel(regionalNo) { return '#' + String(parseInt(regionalNo, 10)).padStart(3, '0'); }

export function render(root) {
  clear(root);
  if (!selectedNo && PLA_RESEARCH.species.length) selectedNo = PLA_RESEARCH.species[0].regional_no;
  root.appendChild(buildView());
}

function buildView() {
  const wrap = el('div', { class: 'pla-dex' });
  const main = el('div', { class: 'pla-main' });
  const list = el('div', { class: 'pla-list-panel' });
  wrap.appendChild(main);
  wrap.appendChild(list);

  // ctx carries the two refresh entry points across the ledger/list split so
  // either side can trigger the other: a tier change (ledger) can move a
  // species in or out of the active filter (list), and picking a species
  // (list) rebuilds the ledger (main). refreshList is filled in right after
  // buildListPanel returns it — by the time anything actually calls
  // ctx.refreshList() (a later click), it's long since been assigned.
  const ctx = { refreshMain: () => fillMain(clear(main), ctx), refreshList: () => {} };
  ctx.refreshList = buildListPanel(list, ctx);
  ctx.refreshMain();
  return wrap;
}

// ---- Right: species list (search + filter + portrait/name rows, Hisui dex
// order). Only the rows themselves are rebuilt on every filter/search/tier
// change — the filter buttons and the search <input> stay put, so typing a
// query never drops focus out of the box mid-keystroke. Returns refreshRows
// so a ledger-side tier change (which can move a species across a filter
// boundary, e.g. into "Complete!") can trigger the same full re-filter
// rather than just patching one row's class in place. ----

function buildListPanel(list, ctx) {
  const rows = el('div', { class: 'pla-list-rows' });
  const refreshRows = () => {
    clear(rows);
    const q = search.trim().toLowerCase();
    let anyVisible = false;
    PLA_RESEARCH.species.forEach((s) => {
      if (q && !s.name.toLowerCase().includes(q)) return;
      const progress = speciesProgress(s);
      const status = statusOf(progress);
      if (filter !== 'all' && filter !== status) return;
      anyVisible = true;
      rows.appendChild(listRow(s, status, ctx));
    });
    if (!anyVisible) rows.appendChild(el('p', { class: 'pla-empty' }, 'No species match.'));
  };

  const filterButtons = FILTERS.map(([val, label]) => el('button', {
    class: 'pla-filter-btn' + (filter === val ? ' active' : ''),
    onclick: (e) => {
      filter = val;
      filterButtons.forEach((b) => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      refreshRows();
    },
  }, label));

  const searchInput = el('input', {
    class: 'pla-search', type: 'search', placeholder: 'Search species…', value: search,
    oninput: (e) => { search = e.target.value; refreshRows(); },
  });

  list.appendChild(el('div', { class: 'pla-filter' }, filterButtons));
  list.appendChild(searchInput);
  list.appendChild(rows);
  refreshRows();
  return refreshRows;
}

function listRow(species, status, ctx) {
  const src = spriteUrl('LA', 'icon', species.national_no, species.form_code);
  const fallback = species.form_code ? spriteUrl('LA', 'icon', species.national_no, '') : null;
  const selected = species.regional_no === selectedNo;
  const row = el('button', {
    class: 'pla-list-row pla-status-' + status + (selected ? ' selected' : ''),
    dataset: { regionalNo: species.regional_no },
  }, [
    el('span', { class: 'pla-list-portrait' }, icon(src, 'pla-list-portrait-img', species.name, 3, fallback)),
    el('span', { class: 'pla-list-name' }, species.name),
  ]);
  row.addEventListener('click', () => {
    if (species.regional_no === selectedNo) return;
    const prevSelected = row.parentElement.querySelector('.pla-list-row.selected');
    if (prevSelected) prevSelected.classList.remove('selected');
    row.classList.add('selected');
    selectedNo = species.regional_no;
    ctx.refreshMain();
  });
  return row;
}

// ---- Left: research-task ledger for the selected species ----

function fillMain(main, ctx) {
  const species = PLA_RESEARCH.species.find((s) => s.regional_no === selectedNo);
  if (!species) { main.appendChild(el('p', { class: 'pla-empty' }, 'No species selected.')); return; }

  main.appendChild(el('div', { class: 'pla-ribbon' }, [el('h3', {}, `Research Tasks for ${species.name}`)]));
  main.appendChild(el('div', { class: 'pla-ribbon-tear' }));

  const sheet = el('div', { class: 'pla-sheet' });
  species.tasks.forEach((t) => sheet.appendChild(taskRow(species, t, ctx)));
  main.appendChild(sheet);

  main.appendChild(levelFooter(species));
}

// The count (e.g. "times caught") is the single source of truth — tiers below
// it are read-only indicators, not independent toggles, same as the in-game
// Pokédex: bumping the count past a threshold ticks it automatically.
function taskRow(species, task, ctx) {
  const maxAmount = task.tiers[task.tiers.length - 1];
  const count = store.getPlaTaskCount(species.regional_no, task.category, task.label);
  const setCount = (next) => {
    store.setPlaTaskCount(species.regional_no, task.category, task.label, Math.max(0, Math.min(maxAmount, next)));
    ctx.refreshMain();
    // A tier crossing can move this species across a filter boundary (e.g.
    // into "Complete!"), so the list needs a real re-filter, not just a
    // class swap on whatever row happened to already be on screen.
    ctx.refreshList();
  };

  const minus = el('button', { class: 'pla-count-btn', disabled: count <= 0 ? '' : null, onclick: () => setCount(count - 1) }, '–');
  const plus = el('button', { class: 'pla-count-btn', disabled: count >= maxAmount ? '' : null, onclick: () => setCount(count + 1) }, '+');
  const counter = el('span', { class: 'pla-count-ctrl' }, [minus, el('span', { class: 'pla-count-value' }, String(count)), plus]);

  return el('div', { class: 'pla-task-row' + (task.boosted ? ' boosted' : '') }, [
    el('span', { class: 'pla-task-icon' }, task.boosted ? '»' : '›'),
    el('span', { class: 'pla-task-label' }, task.label),
    counter,
    el('span', { class: 'pla-tier-pills' }, task.tiers.map((amount) => tierPill(count, amount, setCount))),
  ]);
}

// QoL shortcut: clicking a checkpoint jumps the count straight to its
// threshold — completed or not, since the count is the single source of
// truth either way (clicking an already-done checkpoint rewinds to it,
// same as typing a lower number would).
function tierPill(count, amount, setCount) {
  const done = count >= amount;
  return el('button', {
    class: 'pla-tier-pill' + (done ? ' done' : ''),
    title: `Set to ${amount}`,
    onclick: () => setCount(amount),
  }, done ? '✓' : String(amount));
}

function levelFooter(species) {
  const progress = speciesProgress(species);
  const label = progress.perfect ? 'Perfect!' : progress.level >= 10 ? 'Complete!' : `Lv. ${progress.level}`;
  return el('div', { class: 'pla-footer' }, [
    el('span', { class: 'pla-footer-label' }, 'Research Level'),
    el('span', { class: 'pla-footer-badge pla-status-' + statusOf(progress) }, label),
  ]);
}
