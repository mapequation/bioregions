# bioregions

## 2.0.0-alpha.21

### Minor Changes

- 607c1dc: Redesign the bioregion list and link it to the map. Each bioregion card now opens
  with a minimap of where the region lies in the study area and a summary such as
  "5,124 records of 166 species in 83 cells". Each card lists:
  
  - characteristic species: the species Infomap clustered into the bioregion, ranked
    by map equation centrality;
  - indicator species, ranked by IndVal;
  - the most common species, ranked by records.
  
  Clicking a map cell, legend chip or card selects a bioregion and dims the others.
  Minimaps and "Show on map" fly the map to the region. Hovering the map shows
  bioregion and cell statistics. Also adds species search, sorting, a compact
  layout, a clickable map legend and locator rings for tiny regions.
- 3dd2f19: Add a Data portal for occurrence data and phylogenies, opened from the sidebar's "Data…" button or the empty map. Its tabs are Search GBIF & OBIS, Phylogeny, Upload, Examples and Cite, and it keeps your work when you close and reopen it.
  
  - **Search GBIF & OBIS:** search taxa by scientific or common name and filter by area (countries, or a box drawn on a world map that you can move and resize, with a control to clear it), years, depth and data quality. A preview shows each filter's record impact, bias checks, a density map and the data's composition. Load streams a cleaned, deduplicated dataset into the app up to a record cap; a stopped load can be continued or loaded again.
  - **Phylogeny:** find and load a matching synthetic or published tree from the Open Tree of Life, or upload a Newick file.
  - **Upload:** a format table lists what the app reads (point occurrences as CSV/TSV, range polygons as zipped shapefiles or GeoJSON, Newick trees and GBIF download zips), with column mapping for point files.
  - **Examples:** example datasets show their record and species counts, source and whether a tree is included.
  - **Cite:** a methods paragraph and references for the loaded data, a GBIF derived-dataset CSV, and a citable GBIF download (DOI) that can be imported back as a zip.
  
  Loading new occurrence data replaces the current data. The sidebar shows one card for the loaded occurrences and one for the tree, each with its actions (edit the query, cite, change, remove, stop a running load), and the citation and methods text always describe what is loaded now.
  
  Also fixes: Cancel now stops a running file load, record counters reset between loads, re-running Infomap after loading a tree no longer triggers a "Maximum update depth exceeded" error, the documentation demo no longer logs duplicate React keys, and the icon buttons in the map and tree status bars now have accessible names.

### Patch Changes

- f847bc2: Bioregion colours now come from @mapequation/c3 2 (OKLab-based): colours are more evenly distinct, the Greys scheme no longer gives every bioregion the same grey, and the colour settings swap the HSL saturation range for a Tone choice and an OKLCH lightness range. The default palette is now c3's Oklch hue circle with the strong tone, and a new Colors section in the sidebar holds the palette, tone and the other colour options, with a preview of the bioregion colours.
- a063445: Clear each species' per-region record counts before a new Infomap run. They used
  to add up across runs, so after changing settings or the hierarchy level the
  species pie charts and the tree's ancestral ranges mixed the old and new
  bioregions.
- 0983d27: Update Infomap to 2.16.0 and d3gl to 0.13.0, plus minor and patch updates of React,
  Chakra UI, Turf and the other runtime dependencies. Bioregions, map hover and tree
  highlight look the same as before; the unused `web-vitals` dependency is removed.
- 0589207: Update the state management library to MobX 7 for a smaller app bundle.
- a682bb9: Fix the state network (segregated/overlapping bioregions) being silently
  truncated at the first link below the weight threshold: the guard returned from
  the whole builder instead of skipping the link. Networks now also report how many
  links fell below the threshold, and at full tree weight how many occurrence
  species have no tip in the tree and are left out of the network.

## 2.0.0-alpha.20

### Patch Changes

- 43a5b60: Update `@mapequation/d3gl` to 0.7.0 and adopt its oriented-label model for the
  radial tree. Leaf labels now declare their reading angle (`rotation`/`textAnchor`/
  `keepUpright`) instead of a hand-written CSS transform, so d3gl collides them by
  their true rotated footprint — rotated tips pack tighter and fill the radial fan
  instead of leaving gaps toward the top. The radial branch drawing also drops the
  old `offsetCtx` shim in favour of d3gl's `ctx.translate`. The 0.7.0 bump
  additionally brings faster screen-space declutter for large node counts.
- 7960527: Fix sluggish zoom/pan on the ancestral-ranges tree. The render autorun was
  transitively subscribing to the zoom transform (via `updateLabels` reading the
  observable `view`), so every pan/zoom tick re-ran the full tree layout and
  ancestral-range reconstruction. Labels are now repositioned with the live
  transform and the `view` read is untracked, so a gesture only re-places labels.

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
