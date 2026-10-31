---
"bioregions": minor
---

Add a Data portal for occurrence data and phylogenies, opened from the sidebar's "Data…" button or the empty map. Its tabs are Search GBIF & OBIS, Phylogeny, Upload, Examples and Cite, and it keeps your work when you close and reopen it.

- **Search GBIF & OBIS:** search taxa by scientific or common name and filter by area (countries, or a rectangle drawn on a world map, with a control to clear it), years, depth and data quality. A preview shows each filter's record impact, bias checks, a density map and the data's composition. Load streams a cleaned, deduplicated dataset into the app up to a record cap; a stopped load can be continued or loaded again.
- **Phylogeny:** find and load a matching synthetic or published tree from the Open Tree of Life, or upload a Newick file.
- **Upload:** a format table lists what the app reads (point occurrences as CSV/TSV, range polygons as zipped shapefiles, Newick trees and GBIF download zips), with column mapping for point files.
- **Examples:** example datasets show their record and species counts, source and whether a tree is included.
- **Cite:** a methods paragraph and references for the loaded data, a GBIF derived-dataset CSV, and a citable GBIF download (DOI) that can be imported back as a zip.

Loading new occurrence data replaces the current data. The sidebar shows one card for the loaded occurrences and one for the tree, each with its actions (edit the query, cite, change, remove, stop a running load), and the citation and methods text always describe what is loaded now.

Also fixes: Cancel now stops a running file load, record counters reset between loads, re-running Infomap after loading a tree no longer triggers a "Maximum update depth exceeded" error, the documentation demo no longer logs duplicate React keys, and the icon buttons in the map and tree status bars now have accessible names.
