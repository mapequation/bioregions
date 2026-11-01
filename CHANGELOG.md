# bioregions

## 2.0.0-alpha.22

### Patch Changes

- f50907e: With segregated (state) or multilayer networks, put each grid cell in the
  bioregion that holds most of its flow. A cell whose state nodes fall in several
  modules was given the module of whichever state node came last in Infomap's
  output.
- f50907e: Order a bioregion's most indicative species consistently: by score, then by
  record count, then by name. Scores within 1e-6 of each other were compared by
  count, which is not a consistent order and could rank species differently from
  run to run.
- f50907e: Score a bioregion's most indicative species against one pool of records: the
  records of the species in the network, over all grid cells. The score divided a
  species' share of the bioregion's records by its share of all loaded records,
  including species left out of the network and records outside the grid.
- ef9bc4e: Fix the lineages-through-time curve in the tree view: a node with more than two
  children now adds all its extra lineages, and tips that end before the present
  (extinct lineages in a non-ultrametric tree) are no longer subtracted.
- 917c97f: Fix linear multilayer layer times accumulating floating-point error, so the last
  layer now sits exactly at the tips.
- f50907e: Show multilayer bioregions at the selected module level. Multilayer results
  always used the top level of the hierarchy, whatever level was selected.
- ef9bc4e: Set negative branch lengths in a tree to 0 (with a console warning) instead of
  1, so a negative length no longer stretches the branch and shifts node times.
- 917c97f: Fix NaN link weights: a zero-length branch cut exactly at its time now gives the
  child all the weight, a grid with a single cell gives species weight 1, and a
  tree that adds no links no longer makes the tree link weight NaN.
- ef9bc4e: Read Newick trees more robustly: quoted labels (`'Homo sapiens'`) keep their
  names, numeric tip labels stay names instead of becoming node ids, `[...]`
  comments are skipped, and only the first tree in a file is read, so a second
  tree no longer replaces the first tree's branches. Malformed trees (unbalanced
  or stray parentheses) are rejected with an error, keeping the current tree,
  instead of loading as a wrong tree. A tree
  without branch lengths now gets unit lengths instead of undefined node times.
- 003eb37: Fix range polygons piling up in large grid cells. A cell that split because it
  held too many ranges kept accepting new ranges itself, so the same ranges ended
  up in cells at several sizes and the cell was treated as a leaf when grid cells
  are partitioned. A split cell now passes later ranges on to its sub-cells, as it
  does for point records.
- 003eb37: Fix range polygons sometimes missing from the grid. Points were added to the
  grid as they loaded but polygons only in a later rebuild, which was skipped if
  the map had already drawn the grid during loading. Polygons are now added as
  they load too.
- 003eb37: Count a range polygon only in the grid cells it overlaps. A range used to count
  in every cell its border merely touched, including cells that lie in a hole of
  the range, which inflated species counts along range edges. Binning range
  polygons is also much faster.
- 003eb37: Fix mixed point and range-polygon data landing in the wrong grid cells. Polygons
  and points numbered the four sub-cells of a cell differently, so a point could be
  added to a neighbouring cell created for a polygon. Both now use the same order.
- 003eb37: Fix range polygons that reach longitude 180 being counted in a zero-width grid
  cell on the antimeridian.
- 31e45ee: Fix records at longitude 180 or latitude 90 being binned into a zero-width
  cell outside the grid (with zero area). They now belong to the easternmost
  column and northernmost row of grid cells.
- cdc06e6: Split grid cells at their unclipped midpoints. Cells on the poles and at
  lon 180 are clipped to the globe, but they used to split at the midpoint of the
  clipped cell, so their children were not square and did not line up with the
  rest of the grid. Cells now split at the midpoint of the full power-of-two cell
  and keep its width as their size, so the grid is dyadic everywhere and polar
  children are square.
- 31e45ee: Fix the adaptive grid dropping occurrence records. When a cell reached its
  maximum capacity and split, the record that triggered the split was discarded
  instead of being placed in a child cell, so every split lost one record. The
  arriving record is now redistributed together with the held ones, so a cell
  splits exactly when it would hold more than the maximum capacity.
- cdc06e6: Make grid cells partition the occurrence records when "Patch sparse cells" is
  on. A patched parent cell used to hold every record of its subtree and was
  shown together with its own sub-cells, so records and area were counted more
  than once. Now the records of a cell with fewer than the minimum capacity pass
  up to its parent, and a parent that collects enough of them becomes a remainder
  cell that covers its own area minus its sub-cells. Each record is in at most
  one cell, and records density uses the remainder area. Records that are still
  too few at the maximum cell size are left out of the grid.
- 003eb37: Fix shapefiles losing their last features on load. The loader sent features in
  batches of 101 and dropped the final, partial batch, so up to 100 range
  polygons, and with them whole species, were missing from the analysis.
- 003eb37: Fix loading shapefiles whose species name column holds numbers, such as species
  ids. Loading used to stop silently at the first numeric name.
- a52dbcb: Skip occurrence rows with an empty, non-numeric or out-of-range coordinate instead of placing them at (0, 0) or in broken grid cells, and show the number of skipped rows in the Data panel.
- f50907e: Compute grid-cell overlap and relative richness for segregated (state) and
  multilayer networks. Their cells never recorded which bioregions their taxa
  belong to, so both metrics were always 0, and module participation colouring
  ignored the taxa's bioregions.
- 917c97f: State networks: a tree node whose memory weights sum to less than 1 no longer
  gets an information weight above 1. The strength counts as at least one cell.
- 917c97f: Fix whole-tree state networks without uniform tree links: a tree node linked to
  more (species, cell) pairs than there are cells got a negative weight that was
  subtracted from other links. Such contributions are now left out.
- 917c97f: State networks no longer keep taxon nodes and cell states whose links all fell
  below the link weight threshold.
- f50907e: With segregated (state) or multilayer networks, count a grid cell and its
  records in its own bioregion only. A cell with state nodes in several modules
  was counted in each of them, inflating their grid-cell and record counts and
  their most common and most indicative species.
- 917c97f: State networks now also report how many occurrence species have no tip in the
  tree and are left out of the network at full tree weight.
- 917c97f: State networks (segregated bioregions) now weight species links by their
  information weight, as bipartite networks and the Methods do, instead of giving
  every species link weight 1.
- 917c97f: Fix state-network link weights depending on the order of children in the Newick
  file with uniform tree links: each (cell, memory) state now keeps the largest
  memory weight instead of the first species' weight.
- cdc06e6: Include remainder cells in the bioregion statistics and cell metrics. Patched
  parent cells were left out because their records were also counted in their
  sub-cells. Now that every record is in at most one cell, remainder cells hold
  records no other cell has, so they count towards species totals, mean species
  counts, and the relative richness, overlap, endemicity and occupancy heatmaps.
- c9a9d24: Tooltips stay open while you hover their button instead of flickering on and off, most visibly on the Data button.
- 9a93276: Record points stream onto the map on every load, also when an earlier dataset left the map on its heatmap or bioregions.
- 917c97f: Fix taxa named like a grid cell id (for example numeric species keys) being
  merged with that cell's node in bipartite, state and multilayer networks.
- 917c97f: Fix time-slice networks on non-ultrametric trees: a tree node now links to the
  cells of all its descendant species, not only those below children that reach
  the integration time.
- 917c97f: Fix time-slice networks cut exactly at a tree node: the node's links were filed
  under the names of its children instead of under the node itself.
- 917c97f: Fix tree weight balances just below 1 being treated as 1 in some steps of the
  network builders but not in others, which reported species as excluded while
  still linking them and skipped the balance scaling.
- c4daa3e: Occurrence tables whose header has spaces around the column names, such as `species, longitude, latitude`, load again instead of skipping every row.
- f50907e: Colour grid cells without a bioregion light red (`#ffcccc`). Cells left out of
  the network have bioregion id 0, which had no colour.
- f50907e: Leave grid cells and taxa without links out of the network given to Infomap.
  Infomap kept each of them as an empty bioregion with zero flow; their cells now
  get no bioregion.

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
