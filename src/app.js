// Bootstrap, navigation, savefile bar (import/export/new). SPEC §7–§10.
import './styles.css';
import { loadReferenceData } from './data.js';
import { preloadIcons } from './preload.js';
import * as store from './store.js';
import { computeStats } from './compute.js';
import { el, clear, getPrefs, setPref, downloadJson } from './dom.js';
import { startHost, startJoin, STATUS_TEXT, parseSyncId } from './sync.js';
import * as boxView from './views/box.js';
import * as statsView from './views/stats.js';
import * as hofView from './views/halloffame.js';
import * as profilesView from './views/profiles.js';
import * as registryView from './views/registry.js';
import * as cookingView from './views/cooking.js';
import * as aboutView from './views/about.js';
import * as devView from './views/dev.js';

const TABS = [
  { id: 'box', label: 'Box View', render: boxView.render },
  { id: 'stats', label: 'Stats', render: statsView.render },
  { id: 'registry', label: 'OT Registry', render: registryView.render },
  { id: 'hof', label: 'Hall of Fame', render: hofView.render },
  { id: 'profiles', label: 'Profiles', render: profilesView.render },
  { id: 'cooking', label: 'Cooking', render: cookingView.render },
  { id: 'about', label: 'About', render: aboutView.render },
  // Reference-data editor: only present when the savefile opts into dev mode.
  { id: 'dev', label: 'Dev', render: devView.render, dev: true },
];

// The Dev tab is gated on the loaded savefile's meta.dev_mode flag.
function devOn() { return !!(store.state.meta && store.state.meta.dev_mode); }
function visibleTabs() { return TABS.filter((t) => !t.dev || devOn()); }

let current = getPrefs().tab || 'box';
const content = () => document.getElementById('content');

function renderTab() {
  const tabs = visibleTabs();
  const tab = tabs.find((t) => t.id === current) || tabs[0];
  current = tab.id;
  document.querySelectorAll('.nav-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab.id));
  const c = clear(content());
  try { tab.render(c); }
  catch (e) { console.error(e); c.appendChild(el('pre', { class: 'error' }, String(e && e.stack || e))); }
}

function go(tabId) { current = tabId; setPref('tab', tabId); renderTab(); }

function buildChrome() {
  const app = document.getElementById('app');
  clear(app);

  const header = el('header', { class: 'app-header' }, [
    el('div', { class: 'header-top' }, [
      el('div', { class: 'brand' }, [el('span', { class: 'logo' }, '◓'), el('span', {}, 'DexTracker')]),
      buildSaveBar(),
    ]),
    el('nav', { class: 'nav', id: 'nav' }, navButtons()),
  ]);
  app.appendChild(header);
  app.appendChild(el('main', { id: 'content' }));
}

function navButtons() {
  return visibleTabs().map((t) =>
    el('button', { class: 'nav-tab' + (t.id === current ? ' active' : ''), dataset: { tab: t.id }, onclick: () => go(t.id) }, t.label));
}

// Rebuild the nav buttons (e.g. when dev_mode toggles via a savefile import/new).
// If the active tab is no longer visible, fall back to Box View.
function refreshNav() {
  const nav = document.getElementById('nav');
  if (!nav) return;
  clear(nav);
  navButtons().forEach((b) => nav.appendChild(b));
  if (!visibleTabs().some((t) => t.id === current)) go('box');
}

function buildSaveBar() {
  const fileInput = el('input', { type: 'file', accept: 'application/json,.json', style: 'display:none',
    onchange: (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        try { store.importSave(JSON.parse(reader.result)); updateSaveStatus(); renderTab(); }
        catch (err) { alert('Invalid savefile: ' + err.message); }
      };
      reader.readAsText(f);
      e.target.value = '';
    } });

  const status = el('div', { id: 'save-status', class: 'save-status' });

  // The savefile actions collapse into one popover menu so the header stays
  // compact on phones (4 wrapping buttons used to eat half the screen). A
  // native <details> gives the open/close behaviour without extra state.
  const menu = el('details', { class: 'save-menu' });
  const item = (label, fn) => el('button', { class: 'menu-item', onclick: () => { menu.open = false; fn(); } }, label);
  menu.appendChild(el('summary', { class: 'btn save-menu-btn', title: 'Savefile' }, [
    el('span', {}, 'Data'), el('span', { class: 'caret' }, '▾'),
  ]));
  menu.appendChild(el('div', { class: 'save-menu-pop' }, [
    item('⬆︎  Import', () => fileInput.click()),
    item('⬇︎  Export', doExport),
    item('🔗  Sync', openSyncDialog),
    item('✦  New', newSave),
    fileInput,
  ]));
  // Dismiss when clicking anywhere outside the menu.
  document.addEventListener('click', (e) => { if (menu.open && !menu.contains(e.target)) menu.open = false; });

  return el('div', { class: 'savebar' }, [status, menu]);
}

function newSave() {
  if (confirm('Start a new empty savefile? This replaces the data currently loaded (export first if needed).')) {
    store.resetSave(); updateSaveStatus(); renderTab();
  }
}

function doExport() {
  downloadJson('savefile.json', store.exportSave());
}

// ---- Modal + savefile sync (SPEC: portable user data) ----
function modal(title, bodyNodes, onClose) {
  const overlay = el('div', { class: 'modal-overlay' });
  const close = () => { overlay.remove(); if (onClose) onClose(); };
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  const box = el('div', { class: 'modal' }, [
    el('div', { class: 'modal-head' }, [
      el('h3', {}, title),
      el('button', { class: 'btn icon', title: 'Close', onclick: close }, '✕'),
    ]),
    el('div', { class: 'modal-body' }, bodyNodes),
  ]);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  return { close, box };
}

// Sync hub: this device initiates and picks the direction. Whichever it chooses,
// it hosts a QR/link; the opener's device automatically does the opposite.
function openSyncDialog() {
  const m = modal('Sync with another device', [
    el('p', { class: 'muted' }, 'Transfer a savefile straight between devices over an encrypted peer-to-peer connection. Choose what this device does — the other device just opens the link.'),
    el('div', { class: 'modal-actions' }, [
      el('button', { class: 'btn primary', onclick: () => { m.close(); openHostDialog('send'); } }, '📤  Send this savefile'),
      el('button', { class: 'btn', onclick: () => { m.close(); openHostDialog('receive'); } }, '📥  Receive a savefile'),
    ]),
  ]);
}

// Apply a received savefile (shared by both directions of receiving), with a
// confirm so an incoming save never silently replaces local data.
function applyReceived(data, status, m) {
  let obj;
  try { obj = JSON.parse(data); }
  catch { status.textContent = 'Received invalid data.'; return; }
  if (confirm('Received a savefile from the other device. Import it? This replaces the data currently loaded (export first if needed).')) {
    store.importSave(obj);
    updateSaveStatus();
    renderTab();
    status.textContent = 'Imported ✓';
    status.classList.add('ok');
    setTimeout(m.close, 1000);
  } else {
    status.textContent = 'Discarded.';
    setTimeout(m.close, 800);
  }
}

// Host side: show the QR/link and run `role` ('send' exports this device's save,
// 'receive' imports the opener's). The link tells the opener to do the opposite.
function openHostDialog(role) {
  const sending = role === 'send';
  const canvas = el('canvas', { class: 'qr-canvas', width: 240, height: 240 });
  const linkRow = el('div', { class: 'sync-link muted' }, 'Generating link…');
  const status = el('div', { class: 'sync-status muted' }, 'Starting…');
  let session = null;
  const m = modal(sending ? 'Send savefile' : 'Receive savefile', [
    el('p', { class: 'muted' }, sending
      ? 'On the other device, scan this QR code or open the link to pull this savefile. Keep this window open until it says “Done”.'
      : 'On the other device, scan this QR code or open the link to push its savefile here. Keep this window open until it says “Done”.'),
    el('div', { class: 'qr-wrap' }, [canvas]),
    linkRow,
    status,
  ], () => { if (session) session.close(); });

  // act names what the OPENING device does: the opposite of this host.
  const openerAct = sending ? 'recv' : 'send';
  session = startHost(role, {
    payload: sending ? store.exportSave() : null,
    onPeerId: (id) => {
      const link = location.href.split('#')[0] + '#sync=' + encodeURIComponent(id) + '&act=' + openerAct;
      renderQR(canvas, link);
      clear(linkRow);
      linkRow.appendChild(el('a', { class: 'mono', href: link, target: '_blank', rel: 'noopener' }, link));
    },
    onStatus: (s, err) => {
      status.textContent = STATUS_TEXT[s] || s;
      status.classList.toggle('ok', s === 'done');
      if (err) console.warn('sync host:', err);
    },
    onData: sending ? undefined : (data) => applyReceived(data, status, m),
  });
}

// Joiner side (opened a sync link): run `role`, the opposite of the host.
function openJoinDialog(hostId, role) {
  const sending = role === 'send';
  if (sending && !confirm('Another device wants to import a savefile. Send this device\'s savefile to it?')) return;
  const status = el('div', { class: 'sync-status muted' }, 'Connecting…');
  let session = null;
  const m = modal(sending ? 'Sending savefile' : 'Receiving savefile', [
    el('p', { class: 'muted' }, sending
      ? `Sending this device's savefile to ${hostId}. Keep this window open.`
      : `Receiving from device ${hostId}. Keep this window open.`),
    status,
  ], () => { if (session) session.close(); });

  session = startJoin(hostId, role, {
    payload: sending ? store.exportSave() : null,
    onStatus: (s, err) => {
      status.textContent = STATUS_TEXT[s] || s;
      status.classList.toggle('ok', s === 'done');
      if (err) console.warn('sync join:', err);
    },
    onData: sending ? undefined : (data) => applyReceived(data, status, m),
  });
}

async function renderQR(canvas, text) {
  try {
    const mod = await import('qrcode');
    const QRCode = mod.toCanvas ? mod : (mod.default || mod);
    await QRCode.toCanvas(canvas, text, { width: 240, margin: 1,
      color: { dark: '#0b0f17', light: '#ffffff' } });
  } catch (e) { console.warn('QR render failed:', e); }
}

function counts() {
  const s = store.state;
  const st = computeStats();
  return [
    ['species', `${st.national.owned} / ${st.national.total}`],
    ['forms', `${st.forms.owned} / ${st.forms.total}`],
    ['trainers', `${(s.ot_registry || []).length}`],
  ];
}

function updateSaveStatus() {
  const node = document.getElementById('save-status');
  if (!node) return;
  clear(node);
  counts().forEach(([label, value]) =>
    node.appendChild(el('span', { class: 'stat-chip' }, [
      el('strong', {}, value), el('span', { class: 'stat-label' }, label),
    ])));
}

async function main() {
  buildChrome();
  try {
    await loadReferenceData();
  } catch (e) {
    content().appendChild(el('div', { class: 'error' }, 'Failed to load reference data. ' + e.message));
    return;
  }
  const had = store.load();
  updateSaveStatus();
  refreshNav(); // savefile is loaded now → reflect its dev_mode in the nav
  store.onChange(() => { updateSaveStatus(); refreshNav(); });
  renderTab();
  // Opened via a sync QR/link → drop the hash (so a reload won't reconnect to a
  // dead peer) and start receiving immediately.
  const sync = parseSyncId();
  if (sync) {
    history.replaceState(null, '', location.href.split('#')[0]);
    openJoinDialog(sync.id, sync.role);
  } else if (!had) showWelcome();
  // Warm the shared game/type icons into the cache (paced, off the critical path)
  // so the box grid stops bursting the image host. Fire-and-forget.
  preloadIcons();
  // Service worker is registered automatically by vite-plugin-pwa (injectRegister: 'auto').
}

function showWelcome() {
  const c = content();
  const banner = el('div', { class: 'welcome' }, [
    el('strong', {}, 'Welcome to DexTracker. '),
    el('span', {}, 'No savefile found. Import an existing '),
    el('code', {}, 'savefile.json'),
    el('span', {}, ' (Import button, top-right) or just start recording catches — everything autosaves to this browser.'),
  ]);
  c.insertBefore(banner, c.firstChild);
}

main();
