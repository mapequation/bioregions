---
"bioregions": patch
---

Split grid cells at their unclipped midpoints. Cells on the poles and at
lon 180 are clipped to the globe, but they used to split at the midpoint of the
clipped cell, so their children were not square and did not line up with the
rest of the grid. Cells now split at the midpoint of the full power-of-two cell
and keep its width as their size, so the grid is dyadic everywhere and polar
children are square.
