---
"bioregions": patch
---

Fix the state network (segregated/overlapping bioregions) being silently
truncated at the first link below the weight threshold: the guard returned from
the whole builder instead of skipping the link. Networks now also report how many
links fell below the threshold, and at full tree weight how many occurrence
species have no tip in the tree and are left out of the network.
