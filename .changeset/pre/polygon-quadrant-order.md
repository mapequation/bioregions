---
"bioregions": patch
---

Fix mixed point and range-polygon data landing in the wrong grid cells. Polygons
and points numbered the four sub-cells of a cell differently, so a point could be
added to a neighbouring cell created for a polygon. Both now use the same order.
