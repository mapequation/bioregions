---
"bioregions": patch
---

Fix NaN link weights: a zero-length branch cut exactly at its time now gives the
child all the weight, a grid with a single cell gives species weight 1, and a
tree that adds no links no longer makes the tree link weight NaN.
