# Design: status bars over the map and tree

## Context

Today the most-used view controls live in the left Control Panel, far from the
views they affect. The map's projection, render target, clip and inter-connected
toggles are in `ControlPanel/Map.tsx`; the bioregion module level is a slider in
`ControlPanel/Infomap.tsx`; the tree's layout/links/coords are in
`ControlPanel/Tree.tsx`. Only the rendering backend sits near each view, as a tiny
top-left overlay (`BackendSelect.tsx`).

Following Tufte's principle of placing related parts as close as possible, we add a
**status bar directly above each view** holding that view's most-used options, with
minimal result-derived icons and short hover explanations.

## Goal

Put the frequently-used map and tree controls in a compact status bar above their
respective view, each control shown as a uniform icon button whose graphic is a tiny
picture of the result it produces.

## Scope

### Placement & shell

- Each bar sits **in normal flow, directly above its view** (full view width), not as
  an overlay on the canvas. (Chosen over top/bottom floating overlays so it never
  covers data.)
- The existing `BackendSelect` top-left overlay is **removed**; the rendering backend
  becomes the **leftmost group** of each bar.
- Map bar rendered in `WorldMap.tsx` above the canvas `Box`; tree bar in `App.tsx`'s
  `PhyloTree` above the tree canvas `Box`. Bar width tracks `mapStore.width` /
  `treeStore.width`.

### Map status bar (left → right)

| Group | Control | Store wiring | Notes |
|-------|---------|--------------|-------|
| backend | GL / 2D / SVG (text) | `mapStore.backend` · `setBackend` (`BACKENDS`: `auto`→GL, `canvas`→2D, `svg`→SVG) | leftmost |
| projection | Natural Earth / Orthographic / Mercator (icons) | `mapStore.projectionName` · `setProjection` (+`render()`) | `PROJECTIONS` |
| show | Records / Heatmap / Bioregions (icons) | `mapStore.renderType` · `setRenderType` (+`render()`) | Bioregions disabled until `infomapStore.haveBioregions`; shows loading while `isRunning` |
| level | 1 · 2 · 3 … (text segmented) | `infomapStore.moduleLevel` · `setModuleLevel(v,true)` (+re-render if bioregions) | **only shown when `infomapStore.numLevels > 2`**; button _k_ ⇒ `moduleLevel = k-1`, count = `numLevels-1` |
| boundaries | distinct ↔ fuzzy (2-button, icons) | `mapStore.colorModuleParticipation` · `setColorModuleParticipation` | renamed from "inter-connected / linked" |
| clip | off ↔ on (2-button, icons) | `mapStore.clipToLand` · `setClipToLand` | |

Enable/disable rules:
- **level** and **boundaries** are enabled only when `renderType === 'bioregions'`
  (tooltip explains why when disabled).
- **clip** applies to cell layers (heatmap/bioregions); disabled in `records` mode
  (points ignore clip).

### Tree status bar (left → right)

| Group | Control | Store wiring | Notes |
|-------|---------|--------------|-------|
| backend | GL / 2D / SVG (text) | `treeStore.backend` · `setBackend` | leftmost |
| layout | rectangular / radial (icons) | `treeStore.layout` · `setLayout` (`LAYOUTS`) | |
| links | linear / step / bump (icons) | `treeStore.curve` · `setCurve` (`CURVES`) | |
| coords | world / screen (icons) | `treeStore.coords` · `setCoords` (`COORDS`) | default `screen` |

### Control Panel changes ("move most, keep advanced")

Moved **out** of the panel (now only in the bars): projection, render target, clip,
inter-connected toggle, module level, tree layout/links/coords, backend.

**Kept in the panel** (fine-tuning / advanced):
- `Map.tsx`: heatmap **value** sub-select (richness/endemicity/…), **detailed land**
  toggle, inter-connected **strength** slider (in its existing collapsible, still
  driven by `colorModuleParticipation`), and `ColorSettings`.
- `Infomap.tsx`: the module-level **slider** is removed (replaced by the bar's level
  group); the "Hierarchical levels" stat stays.
- `Tree.tsx` and its `<Section label="Tree">` are **removed** (the section held only
  the three moved controls). Delete `Tree.tsx`; drop the section from
  `ControlPanel.tsx`.

## Component architecture

New folder `src/components/StatusBar/`:

- **`StatusBar.tsx`** — primitives:
  - `StatusBar` — flex-row container styled like the approved mock (bg `#f8fafc`,
    `1px` border, radius on top corners, wraps on narrow widths).
  - `StatusGroup({ caption, children })` — a segmented `ButtonGroup`-like wrapper with
    the small uppercase caption beneath. Captions are kept (user wants them).
  - `StatusButton({ active, disabled, title, children })` — uniform **34×34** square
    cell; supports text or a 24×24 icon child; active style = bg `#e0ecff` +
    `inset 0 -2px 0 #2563eb`; text-active = `#1d4ed8`. Wrapped in a Chakra
    `Tooltip` (from `ui/tooltip`) carrying the longer hover explanation.
- **`MapStatusBar.tsx`** — `observer` reading `mapStore`/`infomapStore`/`colorStore`;
  composes the six map groups per the table above.
- **`TreeStatusBar.tsx`** — `observer` reading `treeStore`; composes the four tree
  groups.
- **`icons.tsx`** — small presentational SVG components (24×24), listed in the
  appendix. Bioregion-derived icons take their two fill colors from a shared helper.

Remove `BackendSelect.tsx` and its two usages.

### Bioregion-color helper (icons derived from the result)

`show:bioregions`, `boundaries`, and `clip` icons use the **live** bioregion palette so
they match the user's current scheme:

```
colors = colorStore.bioregionColors           // c3, scheme-dependent
r1 = colors[0] ?? '#c63968'                    // fallback = Turbo defaults (mock)
r2 = colors[1] ?? '#71c738'
// fuzzy blend matches CellColor: interpolateRgb(r1, r2)(t), t = 0.33 and 0.66
```

Records icon uses `red` (matches the points layer `fill: 'red'`); heatmap icon uses
the YlOrRd ramp from `MapStore._heatmapColor`; ocean (clip "outside") uses
`mapStore.waterColor` (`#f0f8ff`).

## Behavior / data flow

The bars hold **no local state** — every button reads from and writes to the existing
MobX stores, so panel and bar (and rendering) stay in sync automatically. Components
are `observer`-wrapped. Where the current panel handlers also call `mapStore.render()`
after a change (render type, projection, module level), the bar handlers do the same.

## Non-goals

- No redesign of `ColorSettings`, the heatmap-value list, or globe rotation.
- No responsive/mobile layout pass beyond "wrap gracefully when narrower than the bar."
- No persistence of view settings.
- No change to how Infomap computes levels — only how the level is selected.

## Acceptance criteria

- A status bar appears above the map with the six groups; the **level** group appears
  only when `numLevels > 2`; **bioregions/level/boundaries/clip** follow the
  enable/disable rules above.
- A status bar appears above the tree with the four groups.
- The old `BackendSelect` overlay is gone; backend is the leftmost group of each bar.
- Moved controls no longer appear in the Control Panel; kept/advanced controls remain
  and still work.
- Changing a control in the bar updates the view exactly as the old panel control did
  (verified by toggling each); changing the kept strength slider still works.
- Each button has a hover tooltip; group captions are visible.
- Buttons are uniform 34×34 squares with the approved active styling.
- `pnpm build` (tsc + vite) and `pnpm lint` pass.

## Effort

Medium.

---

## Appendix — icon specifications (24×24 viewBox)

Stroke icons use `stroke #475569`, `stroke-width 1.4`, round caps/joins. Cell icons
use 8px squares on a 3×3 grid.

**Projection** — `Natural Earth`: ellipse `rx10 ry6.5` + equator/meridian + two
curved graticules. `Orthographic`: circle `r9` + central meridian ellipse `rx4 ry9` +
equator. `Mercator`: rounded rect `3,4,18,16` + 2 vertical / 2 horizontal grid lines.

**Show** — `Records`: 7 red dots (`r1.7`) scattered. `Heatmap`: 3×3 of 8px cells from
the YlOrRd ramp, hot center. `Bioregions`: 3×3 cells split — region 1 (`r1`) = top row
+ first two of middle row; region 2 (`r2`) = the rest.

**Boundaries** — `distinct` = the bioregions grid (hard edges). `fuzzy` = same grid
but the boundary band blends smoothly along the diagonal: cores stay `r1`/`r2`, the
two boundary bands use `interpolateRgb(r1,r2)` at t≈0.33 and t≈0.66 (monotonic ramp,
no checkerboard).

**Clip** — `off` = the bioregions grid filling the whole tile. `on` = ocean
(`waterColor`) tile with the bioregions grid clipped to a land path that carves ~25%
off the top-left with a wiggly, multi-control-point shoreline, e.g.
`M14 0 L24 0 L24 24 L0 24 L0 16 C4 14 5 11 8 10 C11 9 11 4 14 0 Z`.

**Layout** — `rectangular`: binary 2-level tree (root → 2 children → 4 leaves) with
step (right-angle) links. `radial`: same topology as a half-circle fan — root at
bottom center, two radial branches to child arcs, each arc to two leaf radials, dashed
rim arc.

**Links** (parent forks to two children) — `linear`: straight diagonals. `step`:
vertical-then-horizontal elbows. `bump`: smooth `curveBumpX`-style S-curves.

**Coords** — `world`: globe (circle + meridian ellipse + graticules) with two
different-sized filled pies (pies scale with clade). `screen`: monitor (rounded rect +
stand) with two equal-sized filled pies (fixed screen size).
