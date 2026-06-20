# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Infomap Bioregions 2.0 — a browser app that computes biogeographical regions from
species occurrence data (and optional phylogenetic trees) using the map equation.
React 19 + TypeScript, bundled with Vite, state managed with MobX, UI built on
Chakra UI v3. All computation runs client-side (Infomap is a WASM module); there is
no backend server.

## Commands

The package manager is **pnpm** (pinned via the `packageManager` field; use
`corepack` so the pinned version is used). There is no `package-lock.json` — the
lockfile is `pnpm-lock.yaml`.

```bash
pnpm install         # install deps (CI uses --frozen-lockfile)
pnpm dev             # Vite dev server
pnpm build           # tsc -b (typecheck, project references) then vite build
pnpm lint            # biome lint over the repo (config: biome.json)
pnpm preview         # serve the production build
pnpm fetch-data      # download example datasets (also runs automatically via prebuild)
pnpm styleguide      # react-styleguidist component explorer
pnpm changeset       # record a change for the changelog (see Releases below)
```

There is no configured test runner in `package.json` despite `src/**/*.test.ts`
files existing (e.g. `src/utils/tree/tree.test.ts`) and `src/setupTests.ts`. Don't
assume `pnpm test` works.

The dev server, build, and styleguide depend on example data under `public/data/`.
`scripts/fetch-data.mjs` (run as `prebuild`) downloads it from the
`mapequation/bioregions-data` GitHub repo plus world-atlas land TopoJSON, and skips
the download if the files required by `src/examples.json` already exist.

## Issue-tracking workflow (do this for non-trivial work)

The expensive part of a session is the reasoning — hypotheses tried, tests run to
*rule things out*, the eventual root cause. None of it survives in a merged PR.
Capture it in GitHub issues so a future session can resume. Knowledge tiers, by how
long it stays useful:

- **Repo (`CLAUDE.md` / `docs/`)** — recurs across tasks (architectural gotcha,
  non-obvious constraint, recurring failure mode). The only tier re-read
  automatically next session → durable learnings go here, not in a closed issue.
  `docs/specs` + `docs/plans` (superpowers skills) hold a task's spec/plan.
- **Issue** — *this problem's* understanding. Body = current answer (living doc:
  repro, confirmed root cause, ruled-out paths); edit as understanding changes.
  Comment thread = chronological work log; post negative results explicitly ("tried
  X, ruled out by Y") — most expensive thing to rediscover. End of session: summarize
  with `gh issue comment` or edit the body.
- **PR** — only diff-shaped reasoning (why this approach, tradeoffs, review replies).
  Dies at merge; inline comments detach on rebase. Put **`Fixes #N`** in the PR body
  to auto-close + link issue ↔ PR ↔ commits.
- **New / sub-issues** — a *genuinely new* problem → its own issue, linked
  (`Related to #N`). Same problem getting deeper → stays on the original. Multi-phase
  work → **sub-issues** under a parent (board tracks `Sub-issues progress`).

### Lifecycle (per task)

1. **Open the issue first**, before branching. Create it in the repo, then add it to
   the project — don't rely on the project's "default repository" auto-create.
2. Add to the board: `gh project item-add 5 --owner mapequation --url <issue-url>`
   (lands in **Backlog**). Needs `project,read:project` scopes
   (`gh auth refresh -s project,read:project`).
3. Move **Backlog → Ready** when triaged (manual — see below), **→ In progress** when
   you start, **→ In review** when the PR is open, **→ Done** on merge/close.
4. Branch (worktree under `.claude/worktrees/`), open PR with `Fixes #N`.
5. **Merge with squash** (see below), then **delete the feature branch** (local +
   remote) once it's in `main`.

### Merge strategy & branch cleanup

**Squash-merge feature PRs** (`gh pr merge <N> --squash --delete-branch`). It's the
default best practice here: one commit per PR keeps `main`'s history linear and
readable, makes revert/bisect trivial, and the messy work-in-progress commits stay in
the PR (where, per the issue-tracking rule above, throwaway reasoning belongs). Earlier
PRs used merge commits or rebase-merges — those preserve ancestry but clutter `main`
with intermediate commits and lose the one-PR-one-commit grouping, so don't carry that
pattern forward. Reserve plain merge commits for genuine long-lived branches (none
exist here today).

**Delete the branch on merge.** `--delete-branch` removes it remotely; also prune
locally:

```sh
git checkout main && git pull --ff-only
git fetch --prune origin           # drop stale remote-tracking refs
git branch -d <branch>             # delete local copy (safe; refuses if unmerged)
```

Caveat: a squash-merged branch is **not** an ancestor of `main`, so
`git branch --merged` / `git branch -d` won't recognize it — confirm via the PR
(`gh pr list --state merged`) and use `git branch -D` / `git push origin --delete` for those. **Never delete** `changeset-release/main` (the Changesets release bot branch) or any branch with an open PR.

### Issue body template
For a complex issue, including these sections is helpful.

```md
## Context        # what's wrong / the situation, why it matters
## Goal           # one-sentence outcome
## Scope          # what's in — bullets, concrete
## Files / pointers   # repo-relative paths + symbols to start from
## Acceptance criteria  # how we know it's done (testable)
## Dependencies   # blocking issues (#N), prerequisites
## Non-goals      # explicitly out of scope
## Effort         # Small / Medium / Large
```

### Project board (`Infomap Bioregions`, org project #5)

Status field: **Backlog → Ready → In progress → In review → Done.** Built-in
workflows (Project ▸ ⋯ ▸ Workflows) automate entry/exit only — *Item added* →
Backlog, *PR merged* / *Issue closed* → Done. **Backlog → Ready and In progress / In
review have no built-in automation**: move them manually (Ready = deliberate
"groomed & prioritized" triage signal). Automate only via a label-driven GitHub
Action if wanted — not a built-in workflow.


### Worktrees & shell cwd (avoid committing to the wrong repo)

Feature work happens in a worktree under `.claude/worktrees/<name>/`, which is a SECOND checkout of the same repo. The shell's working directory can silently reset to the **primary** repo between commands (e.g. after a `cd /…/bioregions && …`, a `cd /tmp`, or a tool that resets cwd). If you then run `git add -A && git commit && git push` assuming you're in the worktree, you'll commit to the **primary checkout's branch (usually `main`)** instead — and `git add -A` there will even add `.claude/worktrees/<name>` as an embedded-repo gitlink.

Defenses (do these):
- Run every git/build command with an explicit path — `git -C <worktree> …` — instead of relying on the current directory.
- Stage scoped paths (`git add src/`), never a bare `git add -A`, so a
  wrong-cwd add can't sweep in `.claude/`.
- A `git push` that prints `main -> main` (or warns about an *embedded git repository*) means you're in the wrong checkout — stop and fix before pushing.

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

- Path alias `@/` → `src/` (configured in both `tsconfig` and `vite.config.ts`). Existing code mixes `@/...` and relative imports.
- TypeScript is `strict` with `noUnusedLocals`/`noUnusedParameters` — unused
  symbols fail the build.
- Prettier: single quotes, trailing commas everywhere.
- `__APP_VERSION__` is injected from `package.json` at build time (see `vite.config.ts`).
- `base` is `/bioregions` — the app is served from a subpath, not root.

## Git workflow

### Commit messages — Conventional Commits

This repo follows [Conventional Commits](https://www.conventionalcommits.org/):
`type(scope): description`, with an optional `(#NN)` PR-number suffix. Keep the
description short, imperative, and **lowercase** (recent commits do; older ones are
inconsistent — match the recent style). Types in use here: `feat`, `fix`, `perf`,
`refactor`, `build`, `ci`, `chore`, `docs`. Don't redundantly restate the type in the
description (`fix: avoid version line breaking`, not `fix: Fix version line breaking`).

Because PRs are **squash-merged**, the squash commit's subject defaults to the **PR
title** — so the *PR title itself must be a valid Conventional Commit*, otherwise
`main` gets a non-conventional commit. Set the PR title accordingly when opening it.

- Always delete the feature branch after a PR is merged — use `gh pr merge --delete-branch`
  (removes the local + remote branch), then `git remote prune origin` to drop stale
  remote-tracking refs.
- Prefer a **squash merge** (`gh pr merge --squash`) so each PR lands as a single commit.
  Use a plain merge only for a multi-phase plan where each phase is its own meaningful
  commit that should be preserved in history.

## Releases (Changesets)

Versioning and the changelog are managed with [Changesets](https://github.com/changesets/changesets).
`bioregions` is a **private app** — it is *not* published to npm. Changesets is used
only to bump the version in `package.json` and maintain `CHANGELOG.md`; releasing
ships via the GitHub Pages deploy (`.github/workflows/pages.yml`).

- **Record a change:** run `pnpm changeset`, pick a bump type, write a user-facing
  summary. This writes a markdown file under `.changeset/`. Commit it with your PR.
- **Pre-release mode:** the app is in `alpha` pre-release mode (`.changeset/pre.json`),
  so version runs produce `2.0.0-alpha.N`. Run `pnpm exec changeset pre exit` to
  graduate to a stable `2.0.0` (then the next version run finalizes it).
- **The release PR:** `.github/workflows/release.yml` runs `changesets/action@v1` on
  every push to `main`. When unreleased changesets exist, it opens/updates a
  **"Version Packages"** PR (branch `changeset-release/main`) that applies them —
  bumping the version and updating `CHANGELOG.md`. Merging that PR *is* the release;
  there is no `publish` step. (Requires the repo setting *Allow GitHub Actions to
  create and approve pull requests*.)

Do not hand-edit the version in `package.json` or `CHANGELOG.md` — let the Version
Packages PR do it. Never delete the `changeset-release/main` branch.
