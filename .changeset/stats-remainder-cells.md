---
"bioregions": patch
---

Include remainder cells in the bioregion statistics and cell metrics. Patched
parent cells were left out because their records were also counted in their
sub-cells. Now that every record is in at most one cell, remainder cells hold
records no other cell has, so they count towards species totals, mean species
counts, and the relative richness, overlap, endemicity and occupancy heatmaps.
