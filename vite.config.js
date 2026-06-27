import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages project site is served from /<repo>/. Override with BASE_PATH in CI
// (the deploy workflow derives it from the repo name) or for a custom domain set '/'.
const base = process.env.BASE_PATH || '/DexTracker/';

export default defineConfig({
  base,
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'DexTracker',
        short_name: 'DexTracker',
        description: 'Personal Pokémon living-dex collection tracker.',
        theme_color: '#1b2330',
        background_color: '#1b2330',
        display: 'standalone',
        icons: [
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // Precache the app shell + bundled assets + seed data for offline use.
        globPatterns: ['**/*.{js,css,html,svg,png,json}'],
        // reference_data.json is ~0.5 MB; allow it past the default 2 MB cap anyway.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: `${base}index.html`,
        runtimeCaching: [
          {
            // External sprite hosts (serebii / bulbagarden) — cache-first, lazy.
            urlPattern: ({ url }) => url.origin !== self.location.origin,
            handler: 'CacheFirst',
            options: {
              cacheName: 'sprite-images',
              expiration: { maxEntries: 6000, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
