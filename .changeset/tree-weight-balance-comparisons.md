---
"bioregions": patch
---

Fix tree weight balances just below 1 being treated as 1 in some steps of the
network builders but not in others, which reported species as excluded while
still linking them and skipped the balance scaling.
