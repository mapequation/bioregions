# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Infomap Bioregions 2.0 — a browser app that computes biogeographical regions from
species occurrence data (and optional phylogenetic trees) using the map equation.
React 19 + TypeScript, bundled with Vite, state managed with MobX, UI built on
Chakra UI v3. All computation runs client-side (Infomap is a WASM module); there is
no backend server.

## Commands

```bash
npm run dev          # Vite dev server
npm run build        # tsc -b (typecheck, project references) then vite build
npm run lint         # eslint over the repo
npm run preview      # serve the production build
npm run fetch-data   # download example datasets (also runs automatically via prebuild)
npm run styleguide   # react-styleguidist component explorer
```

There is no configured test runner in `package.json` despite `src/**/*.test.ts`
files existing (e.g. `src/utils/tree/tree.test.ts`) and `src/setupTests.ts`. Don't
assume `npm test` works.

The dev server, build, and styleguide depend on example data under `public/data/`.
`scripts/fetch-data.mjs` (run as `prebuild`) downloads it from the
`mapequation/bioregions-data` GitHub repo plus world-atlas land TopoJSON, and skips
the download if the files required by `src/examples.json` already exist.

## Architecture

### Store graph (MobX)

`RootStore` (`src/store/RootStore.ts`) owns one instance of every store and is the
single source of truth. A single `RootStore` is instantiated in `src/store/index.ts`
and provided through React context; components read it with `useStore()` and must be
wrapped in mobx-react `observer(...)` to react to changes. Stores reach each other
through the `rootStore` back-reference passed to their constructors.

Key stores:
- **SpeciesStore** — loaded occurrence records/range polygons. Owns the
  `QuadtreeGeoBinner`.
- **InfomapStore** — builds the network and runs Infomap; produces `Bioregion[]`.
  Largest and most central store (~60k).
- **TreeStore** — phylogenetic tree (Newick), layout, and ancestral-range parsimony.
- **MapStore** — map/globe rendering state and projection.
- **LandStore** — base-map land geometry.
- **ColorStore**, **SettingsStore**, **ExampleStore**, **DocumentationStore** — support stores.

### Data flow (the central pipeline)

1. **Load** — `SpeciesStore` spawns `src/workers/DataWorker.ts` (a Web Worker) to
   parse input off the main thread. Supported inputs: CSV/TSV occurrence points
   (PapaParse, streamed in chunks) and zipped shapefiles (`shapefile` +
   `@turf/turf`, with name-key auto-detection: `binomial`/`species`/`name`/`id`).
   The worker `postMessage`s `{type:"data"}` chunks and a final `{type:"status",
   status:"complete"}`. Species names are normalized via `utils/names.ts`.
2. **Bin** — each feature is added to the `QuadtreeGeoBinner`
   (`src/utils/QuadTree/`), which adaptively subdivides a power-of-two lon/lat extent
   into grid `Cell`s controlled by min/max cell size (log2) and capacity.
3. **Build + run** — `InfomapStore` turns cells + species (+ optional tree) into a
   bipartite, state, or multilayer network and runs `@mapequation/infomap` (WASM).
   See `BioregionsNetwork` / `BioregionsStateNetwork` / `BioregionsMultilayerNetwork`.
4. **Render** — results become `Bioregion[]`; `MapStore` and `TreeStore` render them.

### Rendering

Map and tree both render through **`@mapequation/d3gl`**, which has pluggable
backends selected at runtime (`auto` / `webgl` / `canvas` / `svg`) — see
`BackendSelect.tsx` and `BACKENDS` in `MapStore.ts`. The map supports flat
projections and an orthographic drag-to-rotate globe (`PROJECTIONS` in `MapStore.ts`).
Rendering is driven imperatively from MobX `autorun`s rather than React re-renders.
`MapStore` also computes several heatmap layers (`HEATMAP_TARGETS`: richness,
endemicity, occupancy, etc.).

The d3gl source is checked out locally at `../d3gl` (repo-relative) — consult it for
the current API, the `.d.ts` types, and the runnable examples under
`../d3gl/website/src/examples/` (e.g. `streaming-passthrough/` shows the pass-through
points path used for the occurrence-record layer in `MapStore.ts`).

### UI

`src/components/ControlPanel/` holds the settings UI (one section per pipeline stage:
Data, Resolution, Infomap, Tree, Map, Colors, Export). `src/components/ui/` are
shadcn-style Chakra UI v3 snippet components — prefer these over raw Chakra wiring.
Theming lives in `src/theme.ts`.

## Conventions

- Path alias `@/` → `src/` (configured in both `tsconfig` and `vite.config.ts` via
  `vite-tsconfig-paths`). Existing code mixes `@/...` and relative imports.
- TypeScript is `strict` with `noUnusedLocals`/`noUnusedParameters` — unused
  symbols fail the build.
- Prettier: single quotes, trailing commas everywhere.
- `__APP_VERSION__` is injected from `package.json` at build time (see `vite.config.ts`).
- `base` is `/bioregions` — the app is served from a subpath, not root.
