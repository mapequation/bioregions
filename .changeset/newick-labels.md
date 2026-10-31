---
"bioregions": patch
---

Read Newick trees more robustly: quoted labels (`'Homo sapiens'`) keep their
names, numeric tip labels stay names instead of becoming node ids, `[...]`
comments are skipped, and only the first tree in a file is read, so a second
tree no longer replaces the first tree's branches. Malformed trees (unbalanced
or stray parentheses) are rejected with an error, keeping the current tree,
instead of loading as a wrong tree. A tree
without branch lengths now gets unit lengths instead of undefined node times.
