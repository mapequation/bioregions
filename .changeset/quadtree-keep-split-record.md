---
"bioregions": patch
---

Fix the adaptive grid dropping occurrence records. When a cell reached its
maximum capacity and split, the record that triggered the split was discarded
instead of being placed in a child cell, so every split lost one record. The
arriving record is now redistributed together with the held ones, so a cell
splits exactly when it would hold more than the maximum capacity.
