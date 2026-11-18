---
"bioregions": patch
---

Export what a scripted pipeline needs to reproduce a study: `query.json` now also holds the exact GBIF and OBIS requests, the citing GBIF download and the app version (the query still imports unchanged), the Export panel can download the loaded tree as Newick with the dataset species names as tips, and the cleaner's rules are pinned in shared test cases (`src/sources/clean-cases.json`). See `docs/query-json.md`.
