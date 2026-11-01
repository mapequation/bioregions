---
"bioregions": patch
---

Make grid cells partition the occurrence records when "Patch sparse cells" is
on. A patched parent cell used to hold every record of its subtree and was
shown together with its own sub-cells, so records and area were counted more
than once. Now the records of a cell with fewer than the minimum capacity pass
up to its parent, and a parent that collects enough of them becomes a remainder
cell that covers its own area minus its sub-cells. Each record is in at most
one cell, and records density uses the remainder area. Records that are still
too few at the maximum cell size are left out of the grid.
