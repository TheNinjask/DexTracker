// Bootstrap, navigation, savefile bar (import/export/new). SPEC §7–§10.
import './styles.css';
import { loadReferenceData } from './data.js';
import * as store from './store.js';
import { el, clear, getPrefs, setPref } from './dom.js';
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

  const status = el('span', { id: 'save-status', class: 'save-status' });

  const bar = el('div', { class: 'savebar' }, [
    status,
    el('button', { class: 'btn', onclick: () => fileInput.click() }, 'Import'),
    el('button', { class: 'btn', onclick: doExport }, 'Export'),
    el('button', { class: 'btn', onclick: () => {
      if (confirm('Start a new empty savefile? This replaces the data currently loaded (export first if needed).')) {
        store.resetSave(); updateSaveStatus(); renderTab();
      }
    } }, 'New'),
    fileInput,
  ]);
  return bar;
}

function doExport() {
  const blob = new Blob([store.exportSave()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: 'savefile.json' });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function counts() {
  const s = store.state;
  const sp = (s.species_ownership || []).length;
  return `${sp} species · ${(s.form_ownership || []).length} forms · ${(s.ot_registry || []).length} trainers`;
}

function updateSaveStatus() {
  const node = document.getElementById('save-status');
  if (node) node.textContent = counts();
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
  if (!had) showWelcome();
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
