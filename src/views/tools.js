// Tools tab: pick a game, then a tool for that game (tools_data.json). Today
// there's only Legends Z-A's Donut Maker, which is the existing cooking view
// under a player-facing name — the module stays "cooking.js" internally.
import { TOOLS, toolIdx } from '../data.js';
import { el, clear, icon } from '../dom.js';
import * as cookingView from './cooking.js';

// Maps a tool's `view` key (tools_data.json) to its renderer.
const TOOL_VIEWS = { cooking: cookingView.render };

let gameId = null;
let toolId = null;

function toolIconUrl(path) {
  if (!path) return '';
  return /^https?:\/\//i.test(path) ? path : import.meta.env.BASE_URL + path;
}

export function render(root) {
  clear(root);
  // Drop selections that no longer resolve (e.g. after a reference-data reload).
  if (gameId && !toolIdx.gameById.has(gameId)) gameId = null;
  if (toolId) {
    const t = toolIdx.toolById.get(toolId);
    if (!t || t.game_id !== gameId) toolId = null;
  }

  if (!gameId) { root.appendChild(buildGameList(root)); return; }
  if (!toolId) { root.appendChild(buildToolList(root)); return; }
  root.appendChild(buildToolView(root));
}

function pickButton(root, item, onSelect) {
  return el('button', { class: 'tool-pick', onclick: () => { onSelect(); render(root); } }, [
    el('span', { class: 'tool-pick-box' }, icon(toolIconUrl(item.icon_url), 'tool-pick-img', item.name)),
    el('span', { class: 'tool-pick-label' }, item.name),
  ]);
}

function buildGameList(root) {
  const card = el('div', { class: 'card' });
  card.appendChild(el('h3', {}, 'Tools'));
  card.appendChild(el('p', { class: 'muted small' }, 'Pick a game to see its tools.'));
  if (!TOOLS.games.length) {
    card.appendChild(el('p', { class: 'muted' }, 'No tools available yet.'));
    return card;
  }
  card.appendChild(el('div', { class: 'tool-pick-grid' },
    TOOLS.games.map((g) => pickButton(root, g, () => { gameId = g.id; toolId = null; }))));
  return card;
}

function buildToolList(root) {
  const game = toolIdx.gameById.get(gameId);
  const tools = TOOLS.tools.filter((t) => t.game_id === gameId);
  const card = el('div', { class: 'card' });
  card.appendChild(buildCrumbs(root, [
    { label: 'Tools', onSelect: () => { gameId = null; } },
    { label: game ? game.name : gameId },
  ]));
  if (!tools.length) {
    card.appendChild(el('p', { class: 'muted' }, 'No tools for this game yet.'));
    return card;
  }
  card.appendChild(el('div', { class: 'tool-pick-grid' },
    tools.map((t) => pickButton(root, t, () => { toolId = t.id; }))));
  return card;
}

function buildToolView(root) {
  const game = toolIdx.gameById.get(gameId);
  const tool = toolIdx.toolById.get(toolId);
  const wrap = el('div', { class: 'tool-view' });
  wrap.appendChild(buildCrumbs(root, [
    { label: 'Tools', onSelect: () => { gameId = null; toolId = null; } },
    { label: game ? game.name : gameId, onSelect: () => { toolId = null; } },
    { label: tool ? tool.name : toolId },
  ]));
  const body = el('div', { class: 'tool-view-body' });
  const renderer = tool && TOOL_VIEWS[tool.view];
  if (renderer) renderer(body);
  else body.appendChild(el('p', { class: 'muted' }, 'This tool isn’t available yet.'));
  wrap.appendChild(body);
  return wrap;
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
