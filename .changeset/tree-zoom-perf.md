---
"bioregions": patch
---

Fix sluggish zoom/pan on the ancestral-ranges tree. The render autorun was
transitively subscribing to the zoom transform (via `updateLabels` reading the
observable `view`), so every pan/zoom tick re-ran the full tree layout and
ancestral-range reconstruction. Labels are now repositioned with the live
transform and the `view` read is untracked, so a gesture only re-places labels.
