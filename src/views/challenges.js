// Challenges & Research Tasks tab: a simple completion checklist for Pokémon
// HOME's Challenges (challenge_data.json) and per-game Research Tasks
// (reasearch_task_data.json). Presentation mirrors the Tools tab: a game/hub
// picker grid, then a breadcrumbed list view. Required-Pokémon icons always use
// the app's HOME icon composition (spriteUrl('home','icon',...)) rather than
// Serebii's own per-game icon set, so they match the rest of the app.
import { CHALLENGES, RESEARCH, researchIdx, spriteUrl } from '../data.js';
import * as store from '../store.js';
import { el, clear, icon, pct, modal } from '../dom.js';

let mode = null; // null = picker, 'home' = Challenges, else = a Research Tasks game id

export function render(root) {
  clear(root);
  if (!mode) { root.appendChild(buildPicker(root)); return; }
  if (mode === 'home') { root.appendChild(buildChallenges(root)); return; }
  root.appendChild(buildResearch(root, mode));
}

// Icon box: a single icon, or two side-by-side halves sharing one square for a
// paired release (e.g. Scarlet & Violet). Each half is its own flex child, so
// its icon is centered within that half (via cover's default centering)
// rather than cropped from a full-box image.
function pickBox(icons, title) {
  const dual = icons.length > 1;
  const box = el('span', { class: 'tool-pick-box' + (dual ? ' dual' : '') });
  if (dual) {
    box.appendChild(el('span', { class: 'dual-half' }, [icon(icons[0], 'tool-pick-img', title)]));
    box.appendChild(el('span', { class: 'dual-half' }, [icon(icons[1], 'tool-pick-img', title)]));
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

// The reward art stays visible regardless of done state — the dedicated
// toggle button is the only done/not-done indicator, so ticking a tier never
// hides what it was for. It's also a button in its own right: the thumbnail
// is necessarily tiny, so clicking it opens the same image at full size.
function stepDot(t) {
  const dot = el('button', {
    class: 'chal-step-dot', type: 'button',
    title: 'View full size',
  }, icon(t.reward_url, 'chal-step-img', t.reward_type || ''));
  dot.addEventListener('click', () => {
    modal(t.reward_type || 'Reward', [icon(t.reward_url, 'chal-reward-full', t.reward_type || '')]);
  });
  return dot;
}

function doneCount(c) { return c.tiers.reduce((n, _, i) => n + (store.isChallengeTierDone(c.id, i) ? 1 : 0), 0); }

function setBadge(badge, done, total) {
  const complete = done === total;
  badge.textContent = complete ? '✓' : `${done}/${total}`;
  badge.classList.toggle('done', complete);
  badge.classList.toggle('partial', done > 0 && !complete);
}

// Every challenge card is the same shape — title + a compact progress badge
// (the reward art lives only in the popup, not on the card face, so ticking
// and reward-browsing are two separate acts). Clicking the card opens a
// dialog listing every tier with its reward and its own toggle.
function challengeRow(c, onToggle) {
  const badge = el('span', { class: 'chal-badge' });
  setBadge(badge, doneCount(c), c.tiers.length);
  const card = el('button', { class: 'chal-card chal-card-btn' }, [
    el('span', { class: 'chal-title' }, c.title),
    badge,
  ]);
  card.addEventListener('click', () => openChallengeModal(c, badge, onToggle));
  return card;
}

// Each row is a plain (non-interactive) reward display — icon, goal, reward
// type — plus one dedicated toggle button off to the side. The reward is
// purely informational; only the toggle is a click target, so browsing the
// reward art can never be mistaken for (or accidentally trigger) ticking it.
function openChallengeModal(c, badge, onToggle) {
  const rows = c.tiers.map((t, i) => {
    const done = store.isChallengeTierDone(c.id, i);
    const toggle = el('button', {
      class: 'chal-modal-toggle' + (done ? ' done' : ''),
      title: done ? 'Mark not done' : 'Mark done',
    }, '✓');
    const row = el('div', { class: 'chal-modal-tier' + (done ? ' done' : '') }, [
      el('div', { class: 'chal-modal-tier-reward' }, [
        stepDot(t),
        el('div', { class: 'chal-modal-tier-info' }, [
          el('span', { class: 'chal-modal-tier-goal' }, t.goal != null ? `Goal: ${t.goal}` : 'One-time'),
          el('span', { class: 'chal-modal-tier-type' }, t.reward_type || ''),
        ]),
      ]),
      toggle,
    ]);
    toggle.addEventListener('click', () => {
      const next = !toggle.classList.contains('done');
      store.setChallengeTierDone(c.id, i, next);
      toggle.classList.toggle('done', next);
      row.classList.toggle('done', next);
      onToggle(next ? 1 : -1);
      setBadge(badge, doneCount(c), c.tiers.length);
    });
    return row;
  });
  modal(c.title, rows);
}

// A task has no standalone done flag — it's ticked one required Pokémon at a
// time, and counts as done once every one of them is.
function taskIsDone(t) { return t.pokemon.every((_, i) => store.isResearchMonDone(t.id, i)); }

function buildResearch(root, gameId) {
  const game = researchIdx.gameById.get(gameId);
  const tasks = RESEARCH.tasks.filter((t) => t.game === gameId).sort((a, b) => a.no - b.no);
  let done = tasks.filter(taskIsDone).length;

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
  body.appendChild(el('div', { class: 'chal-list chal-list-tasks' }, tasks.map((t) => taskRow(t, (delta) => { done += delta; updateProgress(); }))));
  wrap.appendChild(body);
  return wrap;
}

function taskRow(t, onToggle) {
  const card = el('div', { class: 'chal-card chal-task-card' + (taskIsDone(t) ? ' done' : '') }, [
    el('div', { class: 'chal-card-head' }, [
      el('span', { class: 'chal-task-no' }, String(t.no)),
      el('span', { class: 'chal-title' }, t.title),
    ]),
    el('div', { class: 'chal-task-pokemon' }, t.pokemon.map((p, i) => taskPokemonIcon(t, p, i, () => {
      const wasDone = card.classList.contains('done');
      const nowDone = taskIsDone(t);
      if (wasDone === nowDone) return;
      card.classList.toggle('done', nowDone);
      onToggle(nowDone ? 1 : -1);
    }))),
  ]);
  return card;
}

// HOME icon composition (SPEC §3.5). Mega/Legends-Z-A-exclusive forms have no
// official HOME icon, so a form_code that 404s falls back to the base species'.
// Each Pokémon is its own toggle: greyed out until ticked, then filled with
// colour — never covered/obscured, so what you're ticking stays visible.
function taskPokemonIcon(t, p, i, onChange) {
  const src = spriteUrl('home', 'icon', p.national_no, p.form_code);
  const fallback = p.form_code ? spriteUrl('home', 'icon', p.national_no, '') : null;
  const done = store.isResearchMonDone(t.id, i);
  const btn = el('button', {
    class: 'chal-mon' + (done ? ' done' : ''),
    title: p.name,
  }, icon(src, 'chal-task-mon-img', p.name, 3, fallback));
  btn.addEventListener('click', () => {
    const next = !btn.classList.contains('done');
    store.setResearchMonDone(t.id, i, next);
    btn.classList.toggle('done', next);
    onChange();
  });
  return btn;
}
