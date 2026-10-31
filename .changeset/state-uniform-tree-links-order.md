---
"bioregions": patch
---

Fix state-network link weights depending on the order of children in the Newick
file with uniform tree links: each (cell, memory) state now keeps the largest
memory weight instead of the first species' weight.
