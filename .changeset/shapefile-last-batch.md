---
"bioregions": patch
---

Fix shapefiles losing their last features on load. The loader sent features in
batches of 101 and dropped the final, partial batch, so up to 100 range
polygons, and with them whole species, were missing from the analysis.
