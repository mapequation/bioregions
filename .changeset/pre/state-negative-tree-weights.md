---
"bioregions": patch
---

Fix whole-tree state networks without uniform tree links: a tree node linked to
more (species, cell) pairs than there are cells got a negative weight that was
subtracted from other links. Such contributions are now left out.
