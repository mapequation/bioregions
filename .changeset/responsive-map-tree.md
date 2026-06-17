---
"bioregions": patch
---

Make the world map and phylogenetic tree responsive: each view now fills the
available width up to 1200px and keeps a fixed 2:1 aspect ratio, resizing in place
as the window changes (the map refits its projection, the tree re-lays-out and
re-culls labels). Updates `@mapequation/d3gl` to 0.6.0 for its responsive
`aspectRatio` sizing.
