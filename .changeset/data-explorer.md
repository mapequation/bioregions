---
"bioregions": minor
---

Add a data explorer for GBIF and OBIS occurrences and Open Tree of Life phylogenies. Search taxa by scientific or common name, filter by area, years, depth and data quality, and see each filter's record impact, bias checks, a density map and the data's composition update within a second. Stream a cleaned, deduplicated dataset into the app, cite it with a generated methods paragraph, a GBIF derived-dataset CSV or a citable GBIF download (DOI) imported back as a zip, and find and load a matching synthetic or published phylogeny before re-running bioregions.

Also fixes: Cancel now stops a running file load, record counters reset between loads, re-running Infomap after loading a tree no longer triggers a "Maximum update depth exceeded" error, and the documentation demo no longer logs duplicate React keys.
