---
"bioregions": patch
---

Speed up switching hierarchical level on large datasets. The bioregion statistics
list now renders the top 5 modules by default with a "Show all" toggle, instead of
mounting a full table and pie charts for every module — which stalled the UI for
several seconds at deep levels with many modules.
