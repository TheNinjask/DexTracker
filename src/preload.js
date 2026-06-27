// Warm the small, shared set of game/type icons + origin marks into the cache.
//
// The box grid mounts ~30 mark <img>s at once; the external host (bulbagarden,
// behind Cloudflare) rate-limits that burst and 403/429s some requests, leaving
// broken icons. But there are only ~45 *unique* icon/mark images across all
// 1025 Pokémon, so we fetch that set once, paced (low concurrency) and retried,
// to fill the service-worker cache. After this, every grid render is a cache hit
// — no network burst, and it persists across sessions (SW CacheFirst).

import { REF } from './data.js';

function uniqueIconUrls() {
  const urls = new Set();
  REF.games.forEach((g) => { if (g.icon_url) urls.add(g.icon_url); if (g.mark_url) urls.add(g.mark_url); });
  REF.types.forEach((t) => { if (t.icon_url) urls.add(t.icon_url); if (t.tera_icon_url) urls.add(t.tera_icon_url); });
  return [...urls];
}

function loadOne(url, retries) {
  return new Promise((resolve) => {
    let attempt = 0;
    const tryLoad = () => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => (attempt++ < retries
        ? setTimeout(tryLoad, 500 * attempt) // back off; rate-limit usually clears
        : resolve(false));
      img.src = url;
    };
    tryLoad();
  });
}

// Fire-and-forget. Paced via a small worker pool so we never burst the host.
export function preloadIcons({ concurrency = 3, retries = 4 } = {}) {
  const queue = uniqueIconUrls();
  const worker = async () => { while (queue.length) await loadOne(queue.shift(), retries); };
  return Promise.all(Array.from({ length: concurrency }, worker));
}
