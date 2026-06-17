# bioregions

## 2.0.0-alpha.19

### Minor Changes

- d689d55: Add status bars above the world map and tree holding the most-used view controls
  (backend, projection, render target, bioregion level, boundaries, clip — and tree
  layout/links/coords) as compact icon buttons with result-derived graphics and hover
  help. These controls were relocated from the Control Panel (advanced fine-tuning
  stays), and the old top-left backend overlay was removed.

### Patch Changes

- 9c43c7f: Speed up switching hierarchical level on large datasets. The bioregion statistics
  list now renders the top 5 modules by default with a "Show all" toggle, instead of
  mounting a full table and pie charts for every module — which stalled the UI for
  several seconds at deep levels with many modules.
- 3fe3999: Migrate the package manager from npm to pnpm and adopt Changesets for versioning
  and a maintained `CHANGELOG.md`. CI now opens an automatic "Version Packages" PR
  on `main` that bumps the version and updates the changelog (no npm publish — the app
  stays private and ships via the GitHub Pages deploy).
- 7066418: Make the world map and phylogenetic tree responsive: each view now fills the
  available width up to 1200px and keeps a fixed 2:1 aspect ratio, resizing in place
  as the window changes (the map refits its projection, the tree re-lays-out and
  re-culls labels). Updates `@mapequation/d3gl` to 0.6.0 for its responsive
  `aspectRatio` sizing.
- 7066418: Add a reset button to the map and tree status bars that restores the default view
  (pan/zoom, and globe rotation on the map). The tree's button is disabled while the
  view is already at its default. Also widen the tree's right margin so leaf labels
  have more room and are less likely to be clipped.
