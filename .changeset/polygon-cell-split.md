---
"bioregions": patch
---

Fix range polygons piling up in large grid cells. A cell that split because it
held too many ranges kept accepting new ranges itself, so the same ranges ended
up in cells at several sizes and sparse-cell patching never ran for polygon
data. A split cell now passes later ranges on to its sub-cells, as it does for
point records.
