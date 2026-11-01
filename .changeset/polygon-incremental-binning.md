---
"bioregions": patch
---

Fix range polygons sometimes missing from the grid. Points were added to the
grid as they loaded but polygons only in a later rebuild, which was skipped if
the map had already drawn the grid during loading. Polygons are now added as
they load too.
