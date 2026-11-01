---
"bioregions": patch
---

Fix records at longitude 180 or latitude 90 being binned into a zero-width
cell outside the grid (with zero area). They now belong to the easternmost
column and northernmost row of grid cells.
