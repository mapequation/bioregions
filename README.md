# Infomap Bioregions 2.0

A browser app that computes biogeographical regions from species occurrence data
(and optional phylogenetic trees) using [the map equation](https://www.mapequation.org/).
React 19 + TypeScript, bundled with Vite, state managed with MobX, UI built on
Chakra UI v3. All computation runs client-side ([Infomap](https://github.com/mapequation/infomap)
is a WASM module) — there is no backend server.

## Development

The package manager is [pnpm](https://pnpm.io/) (the version is pinned via the
`packageManager` field; `corepack` will pick it up automatically).

```bash
corepack enable      # one-time: lets corepack manage the pinned pnpm version
pnpm install         # install dependencies
pnpm dev             # start the Vite dev server
pnpm build           # typecheck (tsc -b) and build for production into dist/
pnpm lint            # run eslint
pnpm preview         # serve the production build locally
pnpm styleguide      # react-styleguidist component explorer
```

The dev server, build, and styleguide depend on example datasets under
`public/data/`. `scripts/fetch-data.mjs` (run automatically as `prebuild`, or
explicitly via `pnpm fetch-data`) downloads them from the
[`mapequation/bioregions-data`](https://github.com/mapequation/bioregions-data)
repo plus world-atlas land TopoJSON, skipping the download if the files are already
present.

## Releases

Versioning and the changelog are managed with
[Changesets](https://github.com/changesets/changesets). This is a private app — it is
not published to npm; Changesets only bumps the version and maintains `CHANGELOG.md`,
and the app ships via the GitHub Pages deploy.

When a change should appear in the changelog, run `pnpm changeset`, choose a bump
type, and write a short user-facing summary; commit the generated file under
`.changeset/` with your PR. On push to `main`, CI opens a **"Version Packages"** pull
request that applies the accumulated changesets — merging it is the release. The app
is currently in `alpha` pre-release mode, so versions are `2.0.0-alpha.N`.

See [`CLAUDE.md`](./CLAUDE.md) for architecture, conventions, and the full
issue-tracking / release workflow.
