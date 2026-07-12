// News tab: embeds the official Pokémon HOME news feed in an iframe.
import { el, clear } from '../dom.js';

const NEWS_URL = 'https://news.pokemon-home.com/en/list';

export function render(root) {
  clear(root);
  root.appendChild(el('div', { class: 'news-card' }, [
    el('div', { class: 'news-head' }, [
      el('h3', {}, 'News'),
      el('a', { class: 'btn link small', href: NEWS_URL, target: '_blank', rel: 'noopener' }, 'Open in new tab ↗'),
    ]),
    el('iframe', {
      class: 'news-frame',
      src: NEWS_URL,
      title: 'Pokémon HOME News',
      loading: 'lazy',
      referrerpolicy: 'no-referrer',
    }),
  ]));
}
