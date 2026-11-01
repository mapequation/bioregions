---
"bioregions": patch
---

Update `@mapequation/d3gl` to 0.7.0 and adopt its oriented-label model for the
radial tree. Leaf labels now declare their reading angle (`rotation`/`textAnchor`/
`keepUpright`) instead of a hand-written CSS transform, so d3gl collides them by
their true rotated footprint — rotated tips pack tighter and fill the radial fan
instead of leaving gaps toward the top. The radial branch drawing also drops the
old `offsetCtx` shim in favour of d3gl's `ctx.translate`. The 0.7.0 bump
additionally brings faster screen-space declutter for large node counts.
