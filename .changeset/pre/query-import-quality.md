---
"bioregions": patch
---

Keep the excluded GBIF datasets and the minimum records per species when a query is
imported from `query.json`, a share string or the library. Both were silently reset
before, so a re-run query could load a different dataset.
