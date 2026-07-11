# DexTracker

A personal Pokémon living-dex collection tracker — a PWA rebuild of `DexTracker.xlsx`,
built to the functional spec in [`SPEC.md`](SPEC.md).

## What it does

- **Box View** — HOME-style 6×5 box grid; pick any dex (National, Shiny, per-game, Forms),
  toggle Regional/National numbering, "Only Present", search, and a "next to catch" panel.
  Record catches by entering OT/TID — ownership, origin, marks and stats recompute live.
- **Stats** — National/Shiny/Form completion, per-game dex %, and a by-origin breakdown.
- **OT Registry** — the (OT, TID) → origin game / isMine / isGo lookup that resolves origins.
- **Hall of Fame** and **Switch Profiles** (credentials masked).
- **Tools** — a per-game hub of small utilities; currently just Legends Z-A's **Donut Maker**
  (Z-A's berry-cooking planner).

## Data model

- **Reference data** is app-managed seed data shipped with the app, split into three files:
  `public/data/reference_data.json` (species, forms, types, games, dex mappings, sprite-source
  templates), `public/data/cooking_data.json` (the Z-A cooking berry pantry), and
  `public/data/tools_data.json` (the Tools tab's game/tool listing).
- **Savefile** is *your* data (ownership, OT registry, Hall of Fame, profiles, recipes). It is
  **never bundled**. The app keeps it in this browser's `localStorage` and lets you
  **Import** / **Export** a `savefile.json`, or start a **New** empty one. `savefile.json` is
  git-ignored so credentials never get committed.

Sprites are not stored — they're composed on demand (`prefix + pad3(no) + form_code + suffix`,
SPEC §3.5) from serebii/bulbagarden hosts and runtime-cached by the service worker.

## Tech / project layout

[Vite](https://vitejs.dev) (vanilla JS, no UI framework) + [`vite-plugin-pwa`](https://vite-pwa-org.netlify.app/)
for the manifest and offline service worker.

```
index.html              app entry (Vite)
src/                    app source (modules + styles)
  app.js  data.js  store.js  compute.js  dom.js  views/*
public/                static assets copied verbatim
  data/reference_data.json  data/cooking_data.json  data/tools_data.json  icons/*
vite.config.js          base path + PWA config
.github/workflows/deploy.yml  CI build + Pages deploy
```

## Run locally

```sh
npm install
npm run dev       # dev server with HMR
npm run build     # production build → dist/
npm run preview   # serve the built dist/
```

## Deploy to GitHub Pages (automated)

Deployment is handled by GitHub Actions (`.github/workflows/deploy.yml`): every push to
`main` builds with Vite and publishes `dist/` to Pages.

1. **Settings → Pages → Build and deployment**: set **Source = GitHub Actions**.
2. Push to `main`. The workflow builds and deploys automatically.
3. Served at `https://<user>.github.io/DexTracker/`.

The base path is derived from the repo name automatically in CI (`BASE_PATH`); locally it
defaults to `/DexTracker/`. For a custom domain or a different repo name, override
`BASE_PATH` (or edit the default in `vite.config.js`).

The app is offline-capable (service worker) and installable (web manifest).

## Reporting an issue

Found a bug or have an idea? [Open an issue](https://github.com/TheNinjask/DexTracker/issues/new/choose)
and pick a template:

- **Bug report** — something's broken; include repro steps and the app version (see the
  About tab).
- **Feature request** — something you'd like DexTracker to do.
