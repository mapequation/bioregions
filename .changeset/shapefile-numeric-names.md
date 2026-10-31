---
"bioregions": patch
---

Fix loading shapefiles whose species name column holds numbers, such as species
ids. Loading used to stop silently at the first numeric name.
