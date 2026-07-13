// Challenges & Research Tasks tab: a simple completion checklist for Pokémon
// HOME's Challenges (challenge_data.json) and per-game Research Tasks
// (reasearch_task_data.json). Presentation mirrors the Tools tab: a game/hub
// picker grid, then a breadcrumbed list view. Required-Pokémon icons always use
// the app's HOME icon composition (spriteUrl('home','icon',...)) rather than
// Serebii's own per-game icon set, so they match the rest of the app.
import { CHALLENGES, RESEARCH, researchIdx, spriteUrl } from '../data.js';
import * as store from '../store.js';
import { el, clear, icon, pct } from '../dom.js';

let mode = null; // null = picker, 'home' = Challenges, else = a Research Tasks game id

export function render(root) {
  clear(root);
  if (!mode) { root.appendChild(buildPicker(root)); return; }
  if (mode === 'home') { root.appendChild(buildChallenges(root)); return; }
  root.appendChild(buildResearch(root, mode));
}

// Icon box: a single icon, or two overlaid diagonally (half/half) for a paired
// release (e.g. Scarlet & Violet) — matches request note on shared game tiles.
function pickBox(icons, title) {
  const dual = icons.length > 1;
  const box = el('span', { class: 'tool-pick-box' + (dual ? ' dual' : '') });
  if (dual) {
    box.appendChild(icon(icons[0], 'tool-pick-img dual-a', title));
    box.appendChild(icon(icons[1], 'tool-pick-img dual-b', title));
  } else {
    box.appendChild(icon(icons[0], 'tool-pick-img', title));
  }
  return box;
}

function pickButton(root, name, icons, onSelect) {
  return el('button', { class: 'tool-pick', onclick: () => { onSelect(); render(root); } }, [
    pickBox(icons, name),
    el('span', { class: 'tool-pick-label' }, name),
  ]);
}

function buildPicker(root) {
  const card = el('div', { class: 'card' });
  card.appendChild(el('h3', {}, 'Challenges & Research Tasks'));
  card.appendChild(el('p', { class: 'muted small' }, 'Pick Pokémon HOME for Challenges, or a game for its Research Tasks.'));
  const tiles = [];
  if (CHALLENGES.meta) tiles.push(pickButton(root, CHALLENGES.meta.name, [CHALLENGES.meta.icon], () => { mode = 'home'; }));
  RESEARCH.games.forEach((g) => tiles.push(pickButton(root, g.name, g.icons, () => { mode = g.id; })));
  card.appendChild(el('div', { class: 'tool-pick-grid' }, tiles));
  return card;
}

// Breadcrumb trail; every step but the last is a clickable "go back to here".
function buildCrumbs(root, steps) {
  const nodes = [];
  steps.forEach((s, i) => {
    if (i) nodes.push(el('span', { class: 'crumb-sep' }, '›'));
    nodes.push(s.onSelect
      ? el('button', { class: 'crumb-btn', onclick: () => { s.onSelect(); render(root); } }, s.label)
      : el('span', { class: 'crumb-current' }, s.label));
  });
  return el('div', { class: 'tool-crumbs' }, nodes);
}

function progressText(done, total) { return `${done} / ${total} completed (${pct(done, total)})`; }

// Rows/icons are built exactly once per navigation into a list; a tier/task
// toggle only ever mutates the affected button's class + the progress counters
// in place. Re-rendering the whole (~430-icon) list on every click would queue
// a fresh load behind whatever the previous click's render already queued,
// via dom.js's icon() concurrency gate — a backlog that only grows.
function buildChallenges(root) {
  const wrap = el('div', { class: 'tool-view' });
  wrap.appendChild(buildCrumbs(root, [
    { label: 'Challenges & Research', onSelect: () => { mode = null; } },
    { label: CHALLENGES.meta ? CHALLENGES.meta.name : 'Challenges' },
  ]));
  const body = el('div', { class: 'tool-view-body' });

  const totalProgress = el('div', { class: 'chal-progress' });
  body.appendChild(totalProgress);

  let doneTotal = 0, tierTotal = 0;
  const updateTotal = () => { totalProgress.textContent = progressText(doneTotal, tierTotal); };

  CHALLENGES.sections.forEach((section) => {
    const items = CHALLENGES.challenges.filter((c) => c.section === section.id);
    if (!items.length) return;
    const countEl = el('span', { class: 'muted small' });
    let sDone = 0, sTotal = 0;
    const updateSection = () => { countEl.textContent = `${sDone} / ${sTotal}`; };

    const onToggle = (delta) => {
      sDone += delta; doneTotal += delta;
      updateSection(); updateTotal();
    };
    const rows = items.map((c) => challengeRow(c, onToggle));
    items.forEach((c) => c.tiers.forEach((_, i) => {
      sTotal++; tierTotal++;
      if (store.isChallengeTierDone(c.id, i)) { sDone++; doneTotal++; }
    }));
    updateSection();

    body.appendChild(el('div', { class: 'chal-section' }, [
      el('div', { class: 'chal-section-head' }, [el('h4', {}, section.name), countEl]),
      el('div', { class: 'chal-list' }, rows),
    ]));
  });
  updateTotal();

  wrap.appendChild(body);
  return wrap;
}

function challengeRow(c, onToggle) {
  const tierEls = c.tiers.map((t, i) => {
    const done = store.isChallengeTierDone(c.id, i);
    const btn = el('button', {
      class: 'chal-tier' + (done ? ' done' : ''),
      title: (t.goal != null ? `${t.goal} — ` : '') + (t.reward_type || 'Reward'),
    }, [
      icon(t.reward_url, 'chal-tier-img', t.reward_type || ''),
      t.goal != null ? el('span', { class: 'chal-tier-goal' }, String(t.goal)) : null,
    ]);
    btn.addEventListener('click', () => {
      const next = !btn.classList.contains('done');
      store.setChallengeTierDone(c.id, i, next);
      btn.classList.toggle('done', next);
      onToggle(next ? 1 : -1);
    });
    return btn;
  });
  return el('div', { class: 'chal-row' }, [
    el('span', { class: 'chal-title' }, c.title),
    el('div', { class: 'chal-tiers' }, tierEls),
  ]);
}

function buildResearch(root, gameId) {
  const game = researchIdx.gameById.get(gameId);
  const tasks = RESEARCH.tasks.filter((t) => t.game === gameId).sort((a, b) => a.no - b.no);
  let done = tasks.filter((t) => store.isResearchTaskDone(t.id)).length;

  const wrap = el('div', { class: 'tool-view' });
  wrap.appendChild(buildCrumbs(root, [
    { label: 'Challenges & Research', onSelect: () => { mode = null; } },
    { label: game ? game.name : gameId },
  ]));
  const body = el('div', { class: 'tool-view-body' });
  const progressEl = el('div', { class: 'chal-progress' });
  const updateProgress = () => { progressEl.textContent = progressText(done, tasks.length); };
  updateProgress();
  body.appendChild(progressEl);
  body.appendChild(el('div', { class: 'chal-list' }, tasks.map((t) => taskRow(t, (delta) => { done += delta; updateProgress(); }))));
  wrap.appendChild(body);
  return wrap;
}

function taskRow(t, onToggle) {
  const rowDone = store.isResearchTaskDone(t.id);
  const check = el('button', {
    class: 'chal-check' + (rowDone ? ' on' : ''),
    title: rowDone ? 'Mark not done' : 'Mark done',
  }, rowDone ? '✓' : '');
  const row = el('div', { class: 'chal-row chal-task' + (rowDone ? ' done' : '') }, [
    check,
    el('span', { class: 'chal-task-no' }, String(t.no)),
    el('span', { class: 'chal-title' }, t.title),
    el('div', { class: 'chal-task-pokemon' }, t.pokemon.map(taskPokemonIcon)),
  ]);
  check.addEventListener('click', () => {
    const next = !check.classList.contains('on');
    store.setResearchTaskDone(t.id, next);
    check.classList.toggle('on', next);
    check.textContent = next ? '✓' : '';
    check.title = next ? 'Mark not done' : 'Mark done';
    row.classList.toggle('done', next);
    onToggle(next ? 1 : -1);
  });
  return row;
}

// HOME icon composition (SPEC §3.5). Mega/Legends-Z-A-exclusive forms have no
// official HOME icon, so a form_code that 404s falls back to the base species'.
function taskPokemonIcon(p) {
  const src = spriteUrl('home', 'icon', p.national_no, p.form_code);
  const fallback = p.form_code ? spriteUrl('home', 'icon', p.national_no, '') : null;
  return icon(src, 'chal-task-mon-img', p.name, 3, fallback);
}
