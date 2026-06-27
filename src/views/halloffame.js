// Hall of Fame — champion teams grouped by game (SPEC §4.5 / §8).
import { idx, spriteUrl } from '../data.js';
import * as store from '../store.js';
import { resolveOrigin } from '../compute.js';
import { el, clear, icon } from '../dom.js';

export function render(root) {
  clear(root);
  const wrap = el('div', { class: 'hof' });
  const rows = store.state.hall_of_fame || [];
  if (!rows.length) { wrap.appendChild(el('p', { class: 'muted' }, 'No Hall of Fame teams in this savefile.')); root.appendChild(wrap); return; }

  // group by game preserving order
  const order = [], groups = new Map();
  rows.forEach((r) => { const g = r.game || 'Unknown'; if (!groups.has(g)) { groups.set(g, []); order.push(g); } groups.get(g).push(r); });

  order.forEach((g) => {
    const card = el('div', { class: 'card hof-team' });
    const game = idx.gameById.get(g);
    card.appendChild(el('h3', { class: 'hof-title' }, [
      game && game.icon_url ? icon(game.icon_url, 'src-icon', g) : null,
      el('span', {}, g),
    ]));
    const team = el('div', { class: 'hof-roster' });
    groups.get(g).forEach((m) => {
      const o = resolveOrigin(m.ot, m.tid);
      team.appendChild(el('div', { class: 'hof-mon' }, [
        el('img', { class: 'hof-img', loading: 'lazy', src: spriteUrl('home', 'normal', m.national_no, ''), alt: m.species }),
        el('div', { class: 'hof-name' }, m.nickname || m.species),
        el('div', { class: 'muted small' }, `#${parseInt(m.national_no, 10)} · ${m.species}`),
        el('div', { class: 'muted small' }, `OT ${m.ot || '—'} / ${m.tid || '—'}`),
        o.markUrl ? icon(o.markUrl, 'cell-mark inline', o.markCode || '') : null,
      ]));
    });
    card.appendChild(team);
    root.appendChild(card);
  });
}
