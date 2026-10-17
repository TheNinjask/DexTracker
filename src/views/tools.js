// Tools tab: pick a game, then a tool for that game (tools_data.json). Today
// there's only Legends Z-A's Donut Maker, which is the existing cooking view
// under a player-facing name — the module stays "cooking.js" internally.
import { TOOLS, toolIdx } from '../data.js';
import { el, clear, pickIcon, assetUrl, breadcrumbs } from '../dom.js';
import * as cookingView from './cooking.js';
import * as hyperspaceView from './hyperspace.js';
import * as palparkView from './palpark.js';
import * as plaResearchView from './pla_research.js';

// Maps a tool's `view` key (tools_data.json) to its renderer.
const TOOL_VIEWS = { cooking: cookingView.render, hyperspace: hyperspaceView.render, palpark: palparkView.render, 'pla-research': plaResearchView.render };

let gameId = null;
let toolId = null;

export function render(root) {
  clear(root);
  // Drop selections that no longer resolve (e.g. after a reference-data reload).
  if (gameId && !toolIdx.gameById.has(gameId)) gameId = null;
  if (toolId) {
    const t = toolIdx.toolById.get(toolId);
    if (!t || t.game_id !== gameId) toolId = null;
  }

  // The crumb trail is its own bar, floated above whatever card the screen
  // below it renders — never nested inside that card — so it looks
  // identical at every depth it appears at. It's hidden at the root picker
  // itself: with nothing to go back to, a nav bar there is just dead chrome.
  const wrap = el('div', { class: 'tool-view' });
  if (gameId) wrap.appendChild(breadcrumbs(root, render, crumbSteps()));
  const body = el('div', { class: 'tool-view-body' });
  if (!gameId) body.appendChild(buildGameList(root));
  else if (!toolId) body.appendChild(buildToolList(root));
  else body.appendChild(buildToolView(root));
  wrap.appendChild(body);
  root.appendChild(wrap);
}

function crumbSteps() {
  const game = toolIdx.gameById.get(gameId);
  const tool = toolId ? toolIdx.toolById.get(toolId) : null;
  const steps = [
    { label: 'Tools', onSelect: () => { gameId = null; toolId = null; } },
    { label: game ? game.name : gameId, onSelect: toolId ? () => { toolId = null; } : undefined },
  ];
  if (toolId) steps.push({ label: tool ? tool.name : toolId });
  return steps;
}

function pickButton(root, item, onSelect) {
  const icons = (Array.isArray(item.icon_url) ? item.icon_url : [item.icon_url]).map(assetUrl);
  return el('button', { class: 'tool-pick', onclick: () => { onSelect(); render(root); } }, [
    pickIcon(icons, item.name),
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
  const tools = TOOLS.tools.filter((t) => t.game_id === gameId);
  const card = el('div', { class: 'card' });
  if (!tools.length) {
    card.appendChild(el('p', { class: 'muted' }, 'No tools for this game yet.'));
    return card;
  }
  card.appendChild(el('div', { class: 'tool-pick-grid' },
    tools.map((t) => pickButton(root, t, () => { toolId = t.id; }))));
  return card;
}

function buildToolView(root) {
  const tool = toolIdx.toolById.get(toolId);
  const renderer = tool && TOOL_VIEWS[tool.view];
  const body = el('div', {});
  if (renderer) renderer(body);
  else body.appendChild(el('p', { class: 'muted' }, 'This tool isn’t available yet.'));
  return body;
}
