---
"bioregions": minor
---

Redesign the bioregion list and link it to the map. Each bioregion card now opens
with a minimap of where the region lies in the study area and a summary such as
"5,124 records of 166 species in 83 cells". Each card lists:

- characteristic species: the species Infomap clustered into the bioregion, ranked
  by map equation centrality;
- indicator species, ranked by IndVal;
- the most common species, ranked by records.

Clicking a map cell, legend chip or card selects a bioregion and dims the others.
Minimaps and "Show on map" fly the map to the region. Hovering the map shows
bioregion and cell statistics. Also adds species search, sorting, a compact
layout, a clickable map legend and locator rings for tiny regions.
