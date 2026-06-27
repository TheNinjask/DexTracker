// Bootstrap, navigation, savefile bar (import/export/new). SPEC §7–§10.
import './styles.css';
import { loadReferenceData } from './data.js';
import { preloadIcons } from './preload.js';
import * as store from './store.js';
import { computeStats } from './compute.js';
import { el, clear, getPrefs, setPref } from './dom.js';
import { startSend, startReceive, STATUS_TEXT, parseSyncId } from './sync.js';
import * as boxView from './views/box.js';
import * as statsView from './views/stats.js';
import * as hofView from './views/halloffame.js';
import * as profilesView from './views/profiles.js';
import * as registryView from './views/registry.js';
import * as cookingView from './views/cooking.js';

const TABS = [
  { id: 'box', label: 'Box View', render: boxView.render },
  { id: 'stats', label: 'Stats', render: statsView.render },
  { id: 'registry', label: 'OT Registry', render: registryView.render },
  { id: 'hof', label: 'Hall of Fame', render: hofView.render },
  { id: 'profiles', label: 'Profiles', render: profilesView.render },
  { id: 'cooking', label: 'Cooking', render: cookingView.render },
];

let current = getPrefs().tab || 'box';
const content = () => document.getElementById('content');

function renderTab() {
  const tab = TABS.find((t) => t.id === current) || TABS[0];
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
    el('div', { class: 'brand' }, [el('span', { class: 'logo' }, '◓'), el('span', {}, 'DexTracker')]),
    el('nav', { class: 'nav' }, TABS.map((t) =>
      el('button', { class: 'nav-tab', dataset: { tab: t.id }, onclick: () => go(t.id) }, t.label))),
    buildSaveBar(),
  ]);
  app.appendChild(header);
  app.appendChild(el('main', { id: 'content' }));
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

  const actions = el('div', { class: 'save-actions' }, [
    el('button', { class: 'btn', onclick: () => fileInput.click() }, 'Import'),
    el('button', { class: 'btn', onclick: openExportDialog }, 'Export'),
    el('button', { class: 'btn', onclick: () => {
      if (confirm('Start a new empty savefile? This replaces the data currently loaded (export first if needed).')) {
        store.resetSave(); updateSaveStatus(); renderTab();
      }
    } }, 'New'),
    fileInput,
  ]);

  return el('div', { class: 'savebar' }, [status, actions]);
}

function doExport() {
  const blob = new Blob([store.exportSave()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: 'savefile.json' });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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

function openExportDialog() {
  const m = modal('Export savefile', [
    el('p', { class: 'muted' }, 'Download a savefile.json, or sync it straight to another device over an encrypted peer-to-peer connection.'),
    el('div', { class: 'modal-actions' }, [
      el('button', { class: 'btn primary', onclick: () => { m.close(); doExport(); } }, '⬇  Download'),
      el('button', { class: 'btn', onclick: () => { m.close(); openSendDialog(); } }, '📡  Sync to device'),
    ]),
  ]);
}

function openSendDialog() {
  const canvas = el('canvas', { class: 'qr-canvas', width: 240, height: 240 });
  const linkRow = el('div', { class: 'sync-link muted' }, 'Generating link…');
  const status = el('div', { class: 'sync-status muted' }, 'Starting…');
  let session = null;
  const m = modal('Sync to device', [
    el('p', { class: 'muted' }, 'On the other device, scan this QR code or open the link. Keep this window open until it says “Done”.'),
    el('div', { class: 'qr-wrap' }, [canvas]),
    linkRow,
    status,
  ], () => { if (session) session.close(); });

  const payload = store.exportSave();
  session = startSend(payload, {
    onPeerId: (id) => {
      const link = location.href.split('#')[0] + '#sync=' + encodeURIComponent(id);
      renderQR(canvas, link);
      clear(linkRow);
      linkRow.appendChild(el('a', { class: 'mono', href: link, target: '_blank', rel: 'noopener' }, link));
    },
    onStatus: (s, err) => {
      status.textContent = STATUS_TEXT[s] || s;
      status.classList.toggle('ok', s === 'done');
      if (err) console.warn('sync send:', err);
    },
  });
}

function openReceiveDialog(senderId) {
  const status = el('div', { class: 'sync-status muted' }, 'Connecting…');
  let session = null;
  const m = modal('Receiving savefile', [
    el('p', { class: 'muted' }, `Receiving from device ${senderId}. Keep this window open.`),
    status,
  ], () => { if (session) session.close(); });

  session = startReceive(senderId, {
    onStatus: (s, err) => { status.textContent = STATUS_TEXT[s] || s; if (err) console.warn('sync recv:', err); },
    onData: (data) => {
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
    },
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
  store.onChange(updateSaveStatus);
  renderTab();
  // Opened via a sync QR/link → drop the hash (so a reload won't reconnect to a
  // dead peer) and start receiving immediately.
  const syncId = parseSyncId();
  if (syncId) {
    history.replaceState(null, '', location.href.split('#')[0]);
    openReceiveDialog(syncId);
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
