// Completion dashboard (SPEC §6).
import { computeStats } from '../compute.js';
import { el, clear, pct, icon } from '../dom.js';

export function render(root) {
  clear(root);
  const s = computeStats();
  const wrap = el('div', { class: 'stats' });

  wrap.appendChild(el('div', { class: 'stat-cards' }, [
    statCard('National Dex', s.national),
    statCard('Shiny National', s.shinyNational),
    statCard('Form Dex', s.forms),
    statCard('Shiny Forms', s.shinyForms),
  ]));

  // Per-game completion
  const pg = el('div', { class: 'card' });
  pg.appendChild(el('h3', {}, 'Per-game dex completion'));
  const table = el('table', { class: 'data-table' });
  table.appendChild(el('tr', {}, ['Dex', 'Owned', 'Total', '%'].map((h) => el('th', {}, h))));
  s.perGame.forEach((r) => {
    table.appendChild(el('tr', {}, [
      el('td', {}, r.name),
      el('td', {}, String(r.owned)),
      el('td', {}, String(r.total)),
      el('td', {}, barCell(r.pct)),
    ]));
  });
  pg.appendChild(table);
  wrap.appendChild(pg);

  // By source/origin
  const bs = el('div', { class: 'card' });
  bs.appendChild(el('h3', {}, 'By origin (National Dex)'));
  const t2 = el('table', { class: 'data-table' });
  t2.appendChild(el('tr', {}, ['', 'Source', 'Normal', '%', 'Shiny', '%'].map((h) => el('th', {}, h))));
  s.bySource.forEach((r) => {
    t2.appendChild(el('tr', {}, [
      el('td', {}, r.icon ? icon(r.icon, 'src-icon', r.game) : ''),
      el('td', {}, r.game),
      el('td', {}, String(r.normal)),
      el('td', { class: 'muted' }, r.normalPct + '%'),
      el('td', {}, String(r.shiny)),
      el('td', { class: 'muted' }, r.shinyPct + '%'),
    ]));
  });
  bs.appendChild(t2);
  wrap.appendChild(bs);

  root.appendChild(wrap);
}

function statCard(title, m) {
  return el('div', { class: 'card stat' }, [
    el('div', { class: 'stat-title' }, title),
    el('div', { class: 'stat-big' }, `${m.owned}/${m.total}`),
    barCell(m.total ? Math.round((m.owned / m.total) * 1000) / 10 : 0),
    el('div', { class: 'muted' }, `${m.missing} missing · ${m.go} from GO`),
  ]);
}

function barCell(p) {
  return el('div', { class: 'bar' }, [
    el('div', { class: 'bar-fill', style: `width:${Math.min(100, p)}%` }),
    el('span', { class: 'bar-text' }, p + '%'),
  ]);
}
