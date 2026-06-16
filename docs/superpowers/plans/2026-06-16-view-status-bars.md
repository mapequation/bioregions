# View Status Bars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a compact status bar directly above the world map and above the phylogenetic tree, each holding that view's most-used controls as uniform icon buttons whose graphics are tiny pictures of the result they produce.

**Architecture:** Three new presentational primitives (`StatusBar`, `StatusGroup`, `StatusButton`) plus a set of 24×24 SVG icon components. Two `observer` composers (`MapStatusBar`, `TreeStatusBar`) wire the buttons directly to the existing MobX stores — the bars hold **no local state**, so panel and bar stay in sync automatically. The moved controls are deleted from the Control Panel; advanced fine-tuning stays. The old `BackendSelect` overlay is removed and backend becomes the leftmost group of each bar.

**Tech Stack:** React 19 + TypeScript (strict), MobX / mobx-react `observer`, Chakra UI v3 (semantic color tokens for dark-mode safety), d3 (`color`, `interpolateRgb`) for the fuzzy-icon blend.

**Spec:** `docs/superpowers/specs/2026-06-16-view-status-bars-design.md`

---

## ⚠️ Testing reality for this repo

There is **no configured test runner** (`pnpm test` is not wired up; see `CLAUDE.md`). This is a pure UI/MobX wiring change with no pure-logic units worth a harness. Therefore the per-task verification loop is:

1. **Typecheck:** `pnpm exec tsc -b` → expect "no errors" (TypeScript is `strict` with `noUnusedLocals`/`noUnusedParameters`, so dead code fails here).
2. **Lint:** `pnpm lint` → expect no errors.
3. **Manual visual** (integration tasks only): `pnpm dev`, open the app, exercise the control.

Commit after each task once (1) and (2) pass.

---

## File structure

**Create:**
- `src/components/StatusBar/StatusBar.tsx` — `StatusBar`, `StatusGroup`, `StatusButton`, `StatusDivider` primitives.
- `src/components/StatusBar/icons.tsx` — 24×24 SVG icon components + `bioregionIconColors` helper.
- `src/components/StatusBar/MapStatusBar.tsx` — map bar composer (`observer`).
- `src/components/StatusBar/TreeStatusBar.tsx` — tree bar composer (`observer`).

**Modify:**
- `src/components/WorldMap.tsx` — render `MapStatusBar` above the canvas; drop `BackendSelect`.
- `src/components/App.tsx` — render `TreeStatusBar` above the tree canvas; drop `BackendSelect`.
- `src/components/ControlPanel/Map.tsx` — remove projection / render-type / clip / inter-connected toggle; keep heatmap-value select, detailed-land, strength slider, `ColorSettings`.
- `src/components/ControlPanel/Infomap.tsx` — remove the module-level slider block (keep the "Hierarchical levels" stat).
- `src/components/ControlPanel/ControlPanel.tsx` — remove the `Tree` section.

**Delete:**
- `src/components/ControlPanel/Tree.tsx` (its three controls move to the tree bar).
- `src/components/BackendSelect.tsx` (absorbed into the bars).

---

## Task 1: StatusBar primitives

**Files:**
- Create: `src/components/StatusBar/StatusBar.tsx`

- [ ] **Step 1: Write the primitives**

Create `src/components/StatusBar/StatusBar.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Box } from '@chakra-ui/react';
import { Tooltip } from '../ui/tooltip';

/** The bar container: a wrapping flex row that sits above a view. */
export function StatusBar({ children }: { children: ReactNode }) {
  return (
    <Box
      display="flex"
      alignItems="flex-start"
      flexWrap="wrap"
      gap={3}
      px={3}
      py={2}
      mb={2}
      bg="bg.panel"
      borderWidth="1px"
      borderColor="border"
      borderRadius="md"
      boxShadow="xs"
      fontSize="11px"
      lineHeight="1.2"
    >
      {children}
    </Box>
  );
}

/** A thin vertical separator (used after the backend group). */
export function StatusDivider() {
  return <Box alignSelf="stretch" w="1px" bg="border" />;
}

/** A segmented control plus the small uppercase caption beneath it. */
export function StatusGroup({
  caption,
  children,
}: {
  caption: string;
  children: ReactNode;
}) {
  return (
    <Box display="flex" flexDirection="column" alignItems="center" gap="5px">
      <Box
        display="flex"
        borderWidth="1px"
        borderColor="border"
        borderRadius="5px"
        overflow="hidden"
        css={{
          '& > button + button': { borderLeftWidth: '1px', borderColor: 'border' },
        }}
      >
        {children}
      </Box>
      <Box
        fontSize="9px"
        textTransform="uppercase"
        letterSpacing="0.05em"
        color="fg.subtle"
      >
        {caption}
      </Box>
    </Box>
  );
}

/** One uniform 34×34 cell. Text or a 24×24 icon child. Tooltip carries the help text. */
export function StatusButton({
  active = false,
  disabled = false,
  content,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  content: ReactNode;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip content={content} showArrow openDelay={250} closeDelay={50}>
      <Box
        as="button"
        disabled={disabled}
        onClick={disabled ? undefined : onClick}
        w="34px"
        h="34px"
        display="flex"
        alignItems="center"
        justifyContent="center"
        flex="0 0 auto"
        fontWeight="600"
        bg={active ? 'blue.subtle' : 'bg.panel'}
        color={active ? 'blue.fg' : 'fg.muted'}
        boxShadow={active ? 'inset 0 -2px 0 var(--chakra-colors-blue-solid)' : undefined}
        cursor={disabled ? 'not-allowed' : 'pointer'}
        opacity={disabled ? 0.4 : 1}
        transition="background 0.12s"
        _hover={{ bg: active ? 'blue.subtle' : 'bg.muted' }}
      >
        {children}
      </Box>
    </Tooltip>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc -b`
Expected: no errors. (The components are exported but unused so far — that's fine; `noUnusedLocals` flags unused *locals*, not unused *exports*.)

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/StatusBar/StatusBar.tsx
git commit -m "feat: status bar primitives (bar, group, button, divider)"
```

---

## Task 2: Icon components + bioregion color helper

**Files:**
- Create: `src/components/StatusBar/icons.tsx`

- [ ] **Step 1: Write the icons**

Create `src/components/StatusBar/icons.tsx`. Line icons use `stroke="currentColor"` so they adapt to the button's active/dark-mode color; data icons (dots, cells, pies) use intrinsic colors.

```tsx
import { color as d3color, interpolateRgb } from 'd3';
import type ColorStore from '../../store/ColorStore';
import type { Projection } from '../../store/MapStore';

const VB = '0 0 24 24';

/** First two live bioregion colors, with the Turbo-default fallback from the spec. */
export function bioregionIconColors(colorStore: ColorStore): [string, string] {
  const colors = colorStore.bioregionColors;
  return [colors[0] ?? '#c63968', colors[1] ?? '#71c738'];
}

// --- 3×3 cell grid (8px cells) -------------------------------------------------
const XY: [number, number][] = [
  [0, 0], [8, 0], [16, 0],
  [0, 8], [8, 8], [16, 8],
  [0, 16], [8, 16], [16, 16],
];

function Cells({ fills, clipId }: { fills: string[]; clipId?: string }) {
  const rects = fills.map((f, i) => (
    <rect key={i} x={XY[i][0]} y={XY[i][1]} width="8" height="8" fill={f} />
  ));
  return clipId ? <g clipPath={`url(#${clipId})`}>{rects}</g> : <>{rects}</>;
}

/** region 1 = top row + first two of middle row; region 2 = the rest. */
function distinctFills(r1: string, r2: string) {
  return [r1, r1, r1, r1, r1, r2, r2, r2, r2];
}

/**
 * Fuzzy boundary: cores stay pure; the two boundary bands blend along the diagonal
 * and fade by proportion — matches ColorStore (interpolateRgb + opacity).
 */
function fuzzyFills(r1: string, r2: string) {
  const blend = (t: number, opacity: number) => {
    const c = d3color(interpolateRgb(r2, r1)(t))!; // interpolateRgb(secondColor, firstColor)
    c.opacity = opacity;
    return c.toString();
  };
  const b1 = blend(0.66, 0.8); // r1-leaning band, mostly its own region
  const b2 = blend(0.34, 0.62); // r2-leaning band, more mixed → more transparent
  return [r1, r1, b1, b1, b1, b2, b2, b2, r2];
}

// --- show ----------------------------------------------------------------------
export function RecordsIcon() {
  const pts: [number, number][] = [
    [6, 7], [12, 5], [17, 9], [8, 14], [15, 16], [19, 14], [11, 11],
  ];
  return (
    <svg width="24" height="24" viewBox={VB}>
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r="1.7" fill="red" />
      ))}
    </svg>
  );
}

export function HeatmapIcon() {
  const ramp = [
    '#ffeda0', '#fed976', '#feb24c',
    '#fed976', '#bd0026', '#fc4e2a',
    '#ffffcc', '#feb24c', '#fd8d3c',
  ];
  return (
    <svg width="24" height="24" viewBox={VB}>
      <Cells fills={ramp} />
    </svg>
  );
}

export function BioregionsIcon({ r1, r2 }: { r1: string; r2: string }) {
  return (
    <svg width="24" height="24" viewBox={VB}>
      <Cells fills={distinctFills(r1, r2)} />
    </svg>
  );
}

export function BoundariesFuzzyIcon({ r1, r2 }: { r1: string; r2: string }) {
  return (
    <svg width="24" height="24" viewBox={VB}>
      <Cells fills={fuzzyFills(r1, r2)} />
    </svg>
  );
}

const LAND = 'M14 0 L24 0 L24 24 L0 24 L0 16 C4 14 5 11 8 10 C11 9 11 4 14 0 Z';
let clipSeq = 0;
export function ClipOnIcon({ r1, r2, ocean }: { r1: string; r2: string; ocean: string }) {
  const id = `sbland${clipSeq++}`;
  return (
    <svg width="24" height="24" viewBox={VB}>
      <rect width="24" height="24" fill={ocean} />
      <clipPath id={id}>
        <path d={LAND} />
      </clipPath>
      <Cells fills={distinctFills(r1, r2)} clipId={id} />
    </svg>
  );
}

// --- projection (stroke) -------------------------------------------------------
function Stroke({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox={VB}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function ProjectionIcon({ name }: { name: Projection }) {
  if (name === 'geoOrthographic') {
    return (
      <Stroke>
        <circle cx="12" cy="12" r="9" />
        <ellipse cx="12" cy="12" rx="4" ry="9" />
        <path d="M3 12h18" />
      </Stroke>
    );
  }
  if (name === 'geoMercator') {
    return (
      <Stroke>
        <rect x="3" y="4" width="18" height="16" rx="1" />
        <path d="M9 4v16M15 4v16M3 9.5h18M3 14.5h18" />
      </Stroke>
    );
  }
  // geoNaturalEarth1
  return (
    <Stroke>
      <ellipse cx="12" cy="12" rx="10" ry="6.5" />
      <path d="M2 12h20M12 5.5v13" />
      <path d="M5 8.5q7 4 14 0M5 15.5q7-4 14 0" />
    </Stroke>
  );
}

// --- tree: layout --------------------------------------------------------------
export function LayoutRectangularIcon() {
  return (
    <Stroke>
      <path d="M3 12 H7" />
      <path d="M7 6 V18" />
      <path d="M7 6 H11" />
      <path d="M7 18 H11" />
      <path d="M11 3 V9" />
      <path d="M11 3 H21" />
      <path d="M11 9 H21" />
      <path d="M11 15 V21" />
      <path d="M11 15 H21" />
      <path d="M11 21 H21" />
    </Stroke>
  );
}

export function LayoutRadialIcon() {
  return (
    <Stroke>
      <path d="M12 22 L8.5 13.8" />
      <path d="M12 22 L15.5 13.8" />
      <path d="M6.4 15.3 A8 8 0 0 1 10.3 13.2" />
      <path d="M13.7 13.2 A8 8 0 0 1 17.6 15.3" />
      <path d="M6.4 15.3 L0.9 9.5" />
      <path d="M10.3 13.2 L8.7 5.4" />
      <path d="M13.7 13.2 L15.3 5.4" />
      <path d="M17.6 15.3 L23.1 9.5" />
      <path d="M0.9 9.5 A16 16 0 0 1 23.1 9.5" strokeDasharray="2 2" opacity="0.45" />
    </Stroke>
  );
}

// --- tree: links ---------------------------------------------------------------
function LinkDot() {
  return <circle cx="4" cy="12" r="1.3" fill="currentColor" stroke="none" />;
}
export function LinkLinearIcon() {
  return (
    <Stroke>
      <path d="M4 12 L20 6" />
      <path d="M4 12 L20 18" />
      <LinkDot />
    </Stroke>
  );
}
export function LinkStepIcon() {
  return (
    <Stroke>
      <path d="M4 12 V6 H20" />
      <path d="M4 12 V18 H20" />
      <LinkDot />
    </Stroke>
  );
}
export function LinkBumpIcon() {
  return (
    <Stroke>
      <path d="M4 12 C12 12 12 6 20 6" />
      <path d="M4 12 C12 12 12 18 20 18" />
      <LinkDot />
    </Stroke>
  );
}

// --- tree: coords --------------------------------------------------------------
export function CoordsWorldIcon() {
  return (
    <Stroke>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="3.6" ry="9" />
      <path d="M3 12 H21" />
      <path d="M5.2 7 H18.8" />
      <path d="M5.2 17 H18.8" />
      <circle cx="9" cy="9.5" r="2.3" fill="currentColor" stroke="none" opacity="0.9" />
      <circle cx="15.5" cy="15" r="1.2" fill="currentColor" stroke="none" opacity="0.9" />
    </Stroke>
  );
}
export function CoordsScreenIcon() {
  return (
    <Stroke>
      <rect x="3" y="4.5" width="18" height="12.5" rx="1.5" />
      <path d="M9 20.5 H15" />
      <path d="M12 17 V20.5" />
      <circle cx="9.5" cy="10.7" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="10.7" r="1.7" fill="currentColor" stroke="none" />
    </Stroke>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc -b`
Expected: no errors. (Note: `ColorStore` is exported as the default class from `src/store/ColorStore.ts` — confirm the `import type ColorStore from '../../store/ColorStore'` resolves; the file does `export default class ColorStore`.)

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/StatusBar/icons.tsx
git commit -m "feat: result-derived status-bar icons + bioregion color helper"
```

---

## Task 3: MapStatusBar

**Files:**
- Create: `src/components/StatusBar/MapStatusBar.tsx`

- [ ] **Step 1: Write the composer**

Create `src/components/StatusBar/MapStatusBar.tsx`:

```tsx
import { observer } from 'mobx-react';
import { useStore } from '../../store';
import { BACKENDS, PROJECTIONS, PROJECTIONNAME } from '../../store/MapStore';
import { StatusBar, StatusGroup, StatusButton, StatusDivider } from './StatusBar';
import {
  bioregionIconColors,
  ProjectionIcon,
  RecordsIcon,
  HeatmapIcon,
  BioregionsIcon,
  BoundariesFuzzyIcon,
  ClipOnIcon,
} from './icons';

const BACKEND_LABEL: Record<string, string> = { auto: 'GL', canvas: '2D', svg: 'SVG' };
const BACKEND_HELP: Record<string, string> = {
  auto: 'WebGL — GPU rendering, smooth globe & large data',
  canvas: 'Canvas 2D — paints the first frame sooner',
  svg: 'SVG — vector output, exportable',
};

export default observer(function MapStatusBar() {
  const { mapStore, infomapStore, colorStore } = useStore();
  const [r1, r2] = bioregionIconColors(colorStore);
  const isBioregions = mapStore.renderType === 'bioregions';
  const levelCount = infomapStore.numLevels - 1; // selectable levels (slider was 0..numLevels-2)

  return (
    <StatusBar>
      <StatusGroup caption="backend">
        {BACKENDS.map((b) => (
          <StatusButton
            key={b}
            active={mapStore.backend === b}
            content={BACKEND_HELP[b]}
            onClick={() => mapStore.setBackend(b)}
          >
            {BACKEND_LABEL[b]}
          </StatusButton>
        ))}
      </StatusGroup>

      <StatusDivider />

      <StatusGroup caption="projection">
        {PROJECTIONS.map((p) => (
          <StatusButton
            key={p}
            active={mapStore.projectionName === p}
            content={PROJECTIONNAME[p]}
            onClick={() => mapStore.setProjection(p)}
          >
            <ProjectionIcon name={p} />
          </StatusButton>
        ))}
      </StatusGroup>

      <StatusGroup caption="show">
        <StatusButton
          active={mapStore.renderType === 'records'}
          content="Records — raw occurrence points"
          onClick={() => mapStore.setRenderType('records')}
        >
          <RecordsIcon />
        </StatusButton>
        <StatusButton
          active={mapStore.renderType === 'heatmap'}
          content="Heatmap — value per grid cell"
          onClick={() => mapStore.setRenderType('heatmap')}
        >
          <HeatmapIcon />
        </StatusButton>
        <StatusButton
          active={isBioregions}
          disabled={!infomapStore.haveBioregions}
          content={
            infomapStore.haveBioregions
              ? 'Bioregions — computed regions'
              : 'Bioregions — run Infomap first'
          }
          onClick={() => mapStore.setRenderType('bioregions')}
        >
          <BioregionsIcon r1={r1} r2={r2} />
        </StatusButton>
      </StatusGroup>

      {infomapStore.numLevels > 2 && (
        <StatusGroup caption="level">
          {Array.from({ length: levelCount }, (_, i) => i + 1).map((k) => (
            <StatusButton
              key={k}
              active={infomapStore.moduleLevel === k - 1}
              content={`Module level ${k}`}
              onClick={() => {
                infomapStore.setModuleLevel(k - 1, true);
                if (mapStore.renderType === 'bioregions') mapStore.render();
              }}
            >
              {k}
            </StatusButton>
          ))}
        </StatusGroup>
      )}

      <StatusGroup caption="boundaries">
        <StatusButton
          active={!mapStore.colorModuleParticipation}
          disabled={!isBioregions}
          content="Distinct — hard boundaries between bioregions"
          onClick={() => mapStore.setColorModuleParticipation(false)}
        >
          <BioregionsIcon r1={r1} r2={r2} />
        </StatusButton>
        <StatusButton
          active={mapStore.colorModuleParticipation}
          disabled={!isBioregions}
          content="Inter-connected — fuzzy transition zones between bioregions"
          onClick={() => mapStore.setColorModuleParticipation(true)}
        >
          <BoundariesFuzzyIcon r1={r1} r2={r2} />
        </StatusButton>
      </StatusGroup>

      <StatusGroup caption="clip">
        <StatusButton
          active={!mapStore.clipToLand}
          disabled={mapStore.renderType === 'records'}
          content="No clip — colors fill the ocean too"
          onClick={() => mapStore.setClipToLand(false)}
        >
          <BioregionsIcon r1={r1} r2={r2} />
        </StatusButton>
        <StatusButton
          active={mapStore.clipToLand}
          disabled={mapStore.renderType === 'records'}
          content="Clip to land — colors follow the coastline"
          onClick={() => mapStore.setClipToLand(true)}
        >
          <ClipOnIcon r1={r1} r2={r2} ocean={mapStore.waterColor} />
        </StatusButton>
      </StatusGroup>
    </StatusBar>
  );
});
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc -b`
Expected: no errors. Confirms `mapStore.setBackend`, `setProjection`, `setRenderType`, `setColorModuleParticipation`, `setClipToLand`, `waterColor`, and `infomapStore.{numLevels,moduleLevel,setModuleLevel,haveBioregions}` all resolve.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/StatusBar/MapStatusBar.tsx
git commit -m "feat: MapStatusBar wired to map/infomap/color stores"
```

---

## Task 4: TreeStatusBar

**Files:**
- Create: `src/components/StatusBar/TreeStatusBar.tsx`

- [ ] **Step 1: Write the composer**

Create `src/components/StatusBar/TreeStatusBar.tsx`. The option arrays previously lived in the (now-deleted) `Tree.tsx`; define them here. Note `coords` order is world → screen (default `screen`).

```tsx
import { observer } from 'mobx-react';
import { useStore } from '../../store';
import type { LayoutMode, CurveMode, SizeMode } from '../../utils/tree/treeLayout';
import type { BackendType } from '@mapequation/d3gl/map';
import { BACKENDS } from '../../store/MapStore';
import { StatusBar, StatusGroup, StatusButton, StatusDivider } from './StatusBar';
import {
  LayoutRectangularIcon,
  LayoutRadialIcon,
  LinkLinearIcon,
  LinkStepIcon,
  LinkBumpIcon,
  CoordsWorldIcon,
  CoordsScreenIcon,
} from './icons';

const BACKEND_LABEL: Record<string, string> = { auto: 'GL', canvas: '2D', svg: 'SVG' };
const BACKEND_HELP: Record<string, string> = {
  auto: 'WebGL — GPU rendering',
  canvas: 'Canvas 2D',
  svg: 'SVG — vector output',
};

const LAYOUTS: { value: LayoutMode; icon: JSX.Element; help: string }[] = [
  { value: 'rectangular', icon: <LayoutRectangularIcon />, help: 'Rectangular — dated phylogram' },
  { value: 'radial', icon: <LayoutRadialIcon />, help: 'Radial — half-circle fan' },
];
const CURVES: { value: CurveMode; icon: JSX.Element; help: string }[] = [
  { value: 'linear', icon: <LinkLinearIcon />, help: 'Linear — straight branches' },
  { value: 'step', icon: <LinkStepIcon />, help: 'Step — right-angle elbows' },
  { value: 'bump', icon: <LinkBumpIcon />, help: 'Bump — smooth curves' },
];
const COORDS: { value: SizeMode; icon: JSX.Element; help: string }[] = [
  { value: 'world', icon: <CoordsWorldIcon />, help: 'World — node pies scale with clade & zoom' },
  { value: 'screen', icon: <CoordsScreenIcon />, help: 'Screen — fixed-size node pies (declutter on zoom)' },
];

export default observer(function TreeStatusBar() {
  const { treeStore } = useStore();
  return (
    <StatusBar>
      <StatusGroup caption="backend">
        {BACKENDS.map((b: BackendType) => (
          <StatusButton
            key={b}
            active={treeStore.backend === b}
            content={BACKEND_HELP[b]}
            onClick={() => treeStore.setBackend(b)}
          >
            {BACKEND_LABEL[b]}
          </StatusButton>
        ))}
      </StatusGroup>

      <StatusDivider />

      <StatusGroup caption="layout">
        {LAYOUTS.map((o) => (
          <StatusButton
            key={o.value}
            active={treeStore.layout === o.value}
            content={o.help}
            onClick={() => treeStore.setLayout(o.value)}
          >
            {o.icon}
          </StatusButton>
        ))}
      </StatusGroup>

      <StatusGroup caption="links">
        {CURVES.map((o) => (
          <StatusButton
            key={o.value}
            active={treeStore.curve === o.value}
            content={o.help}
            onClick={() => treeStore.setCurve(o.value)}
          >
            {o.icon}
          </StatusButton>
        ))}
      </StatusGroup>

      <StatusGroup caption="coords">
        {COORDS.map((o) => (
          <StatusButton
            key={o.value}
            active={treeStore.coords === o.value}
            content={o.help}
            onClick={() => treeStore.setCoords(o.value)}
          >
            {o.icon}
          </StatusButton>
        ))}
      </StatusGroup>
    </StatusBar>
  );
});
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc -b`
Expected: no errors. (If `JSX.Element` is unrecognized under the project's JSX runtime, replace the three `JSX.Element` annotations with `import type { ReactElement } from 'react'` and use `ReactElement`.)

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/StatusBar/TreeStatusBar.tsx
git commit -m "feat: TreeStatusBar wired to tree store"
```

---

## Task 5: Mount the bars; remove BackendSelect

**Files:**
- Modify: `src/components/WorldMap.tsx`
- Modify: `src/components/App.tsx`
- Delete: `src/components/BackendSelect.tsx`

- [ ] **Step 1: Update `WorldMap.tsx`**

Replace the `BackendSelect` import (line 6) and its usage. The component's return becomes:

Change the import line:
```tsx
// remove:
import BackendSelect from './BackendSelect';
// add:
import MapStatusBar from './StatusBar/MapStatusBar';
```

Replace the returned JSX of the default export (currently lines 86–97) with:
```tsx
  return (
    <Box ml={4} position="relative" width={width}>
      <MapStatusBar />
      {/* Relative wrapper sized to the canvas: the hover tooltip is positioned in the same
          coordinate space as the d3gl pointer offsets. Hover outline + selection dimming are
          handled natively by d3gl on the cells layer (see MapStore.buildLayers). */}
      <Box position="relative" width={width} height={height}>
        <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
        <MapTooltip />
      </Box>
    </Box>
  );
```

- [ ] **Step 2: Update `App.tsx` (PhyloTree)**

Change the import (line 11):
```tsx
// remove:
import BackendSelect from './BackendSelect';
// add:
import TreeStatusBar from './StatusBar/TreeStatusBar';
```

Replace the `PhyloTree` return (currently lines 83–97) with:
```tsx
  return (
    <Box ml={4} position="relative" width={treeStore.width}>
      <TreeStatusBar />
      {/* Relative wrapper sized to the canvas: the hover tooltip is positioned in the same
          coordinate space as the d3gl pointer offsets. */}
      <Box
        position="relative"
        width={treeStore.width}
        height={treeStore.height}
      >
        <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
        <TreeTooltip />
      </Box>
    </Box>
  );
```

- [ ] **Step 3: Delete the old overlay**

```bash
git rm src/components/BackendSelect.tsx
```

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc -b`
Expected: no errors. (No remaining references to `BackendSelect` — `tsc` would otherwise fail on the dangling import.)

- [ ] **Step 5: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 6: Manual visual check**

Run: `pnpm dev`, open the app, load an example dataset and run Infomap.
Expected: a status bar sits above the map and above the tree; backend is the leftmost group in each; switching projection/show/level/boundaries/clip and tree layout/links/coords all visibly affect the view; the old top-left backend overlay is gone.

- [ ] **Step 7: Commit**

```bash
git add src/components/WorldMap.tsx src/components/App.tsx
git commit -m "feat: mount map/tree status bars; drop BackendSelect overlay"
```

---

## Task 6: Trim the Control Panel

**Files:**
- Modify: `src/components/ControlPanel/Map.tsx`
- Modify: `src/components/ControlPanel/Infomap.tsx`
- Modify: `src/components/ControlPanel/ControlPanel.tsx`
- Delete: `src/components/ControlPanel/Tree.tsx`

- [ ] **Step 1: Rewrite `ControlPanel/Map.tsx`**

The projection, render-type, clip, and inter-connected toggle move to the bar. Keep: heatmap-value select (shown when heatmap), detailed-land switch, inter-connected **strength** slider (still controlled by `colorModuleParticipation`), and `ColorSettings`. Replace the whole file with:

```tsx
import { observer } from 'mobx-react';
import {
  Flex,
  VStack,
  Spacer,
  Box,
  Tag,
  Field,
  Collapsible,
} from '@chakra-ui/react';
import { useStore } from '../../store';
import type { HeatmapTarget } from '../../store/MapStore';
import { HEATMAP_TARGETS, HEATMAP_TARGET_NAME } from '../../store/MapStore';
import ColorSettings from './ColorSettings';
import Select from './Select';
import { Switch } from '../ui/switch';
import { Slider } from '../ui/slider';

export default observer(function Map() {
  const { mapStore } = useStore();

  return (
    <VStack>
      {mapStore.renderType === 'heatmap' && (
        <Field.Root display="flex" flexDir="row" w="100%" alignItems="center">
          <Field.Label htmlFor="heatmapTarget" mb="0">
            Heatmap value
          </Field.Label>
          <Spacer />
          <Select
            size="sm"
            value={[mapStore.heatmapTarget]}
            name="heatmapTarget"
            onValueChange={(e) =>
              mapStore.setHeatmapTarget(e.value[0] as HeatmapTarget, true)
            }
            items={HEATMAP_TARGETS.map((target) => ({
              label: HEATMAP_TARGET_NAME[target],
              value: target,
            }))}
          />
        </Field.Root>
      )}

      <Field.Root display="flex" flexDir="row" w="100%" alignItems="center">
        <Field.Label htmlFor="fineLand" mb="0">
          Detailed land
        </Field.Label>
        <Spacer />
        <Switch
          id="fineLand"
          checked={mapStore.useFineLand}
          onCheckedChange={() => mapStore.setUseFineLand(!mapStore.useFineLand)}
        />
      </Field.Root>

      <Collapsible.Root
        open={mapStore.colorModuleParticipation}
        style={{ width: '100%', marginTop: 0 }}
      >
        <Collapsible.Content>
          <Flex w="100%" pl="10px" py={2} alignItems="center">
            <Box minW="100px" fontSize="0.9rem">
              Boundary strength
            </Box>
            <Slider
              mx={3}
              w="100%"
              size="sm"
              disabled={!mapStore.colorModuleParticipation}
              value={[mapStore.colorModuleParticipationStrength]}
              onValueChange={(e) =>
                mapStore.setColorModuleParticipationStrength(e.value[0])
              }
              onValueChangeEnd={(e) =>
                mapStore.setColorModuleParticipationStrength(e.value[0], true)
              }
              min={0}
              max={1}
              step={0.1}
            />
            <Tag.Root size="sm" minW={50}>
              <Tag.Label>{mapStore.colorModuleParticipationStrength}</Tag.Label>
            </Tag.Root>
          </Flex>
        </Collapsible.Content>
      </Collapsible.Root>

      <ColorSettings />
    </VStack>
  );
});
```

- [ ] **Step 2: Remove the module-level slider from `Infomap.tsx`**

In `src/components/ControlPanel/Infomap.tsx`, the block at ~lines 244–277 renders the "Hierarchical levels" stat **and** the module-level slider. Keep the stat; remove the slider `Flex`. Replace that block with:

```tsx
      {infomapStore.numLevels > 2 && (
        <Stat label="Hierarchical levels">{infomapStore.numLevels - 1}</Stat>
      )}
```

Then remove any imports left unused by deleting the slider (TypeScript `noUnusedLocals` will tell you which). Run `pnpm exec tsc -b` and remove each flagged unused import from `Infomap.tsx` (likely `Slider`, and possibly `Flex`/`Box`/`Tag` if they are no longer referenced elsewhere in the file — only remove ones `tsc` reports as unused).

- [ ] **Step 3: Remove the Tree section from `ControlPanel.tsx`**

In `src/components/ControlPanel/ControlPanel.tsx`:
- Delete the import `import Tree from './Tree';` (line 7).
- Delete the section (lines 48–50):
```tsx
      <Section label="Tree">
        <Tree />
      </Section>
```

- [ ] **Step 4: Delete `Tree.tsx`**

```bash
git rm src/components/ControlPanel/Tree.tsx
```

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc -b`
Expected: no errors. (Catches any unused import left behind in `Map.tsx`/`Infomap.tsx` and any dangling `Tree` reference.)

- [ ] **Step 6: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 7: Manual visual check**

Run: `pnpm dev`.
Expected: the Control Panel's Map section now shows only Heatmap value (when heatmap) / Detailed land / Boundary strength (when boundaries on) / Colors; the Infomap section shows the "Hierarchical levels" stat but no level slider; there is no Tree section. Changing the bar's boundaries toggle still opens/closes the strength slider in the panel, and the slider still works.

- [ ] **Step 8: Commit**

```bash
git add src/components/ControlPanel/Map.tsx src/components/ControlPanel/Infomap.tsx src/components/ControlPanel/ControlPanel.tsx
git commit -m "refactor: move map/tree controls to status bars; trim Control Panel"
```

---

## Task 7: Changeset + full build + final verification

**Files:**
- Create: `.changeset/view-status-bars.md`

- [ ] **Step 1: Write the changeset**

Create `.changeset/view-status-bars.md`:

```md
---
"bioregions": minor
---

Add status bars above the world map and tree holding the most-used view controls
(backend, projection, render target, bioregion level, boundaries, clip — and tree
layout/links/coords) as compact icon buttons with result-derived graphics and hover
help. These controls were relocated from the Control Panel (advanced fine-tuning
stays), and the old top-left backend overlay was removed.
```

- [ ] **Step 2: Full production build**

Run: `pnpm build`
Expected: `tsc -b` passes and `vite build` completes without errors. (Requires `public/data/` — `prebuild`/`fetch-data` provides it; if the build skips data because it already exists, that's fine.)

- [ ] **Step 3: Lint the whole repo**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 4: Final manual acceptance pass**

Run: `pnpm dev` and verify against the spec's acceptance criteria:
- Map bar shows backend · projection · show · (level when `numLevels > 2`) · boundaries · clip; tree bar shows backend · layout · links · coords.
- `level` group appears only for a multi-level solution; `boundaries` disabled unless render = bioregions; `clip` disabled in records mode.
- Bioregion/boundaries/clip icons use the current palette (switch the color scheme in the panel and confirm the icons follow).
- Every button has a hover tooltip; group captions visible; buttons are uniform 34×34.
- Toggling each bar control affects the view exactly as before; the kept strength slider still works.

- [ ] **Step 5: Commit**

```bash
git add .changeset/view-status-bars.md
git commit -m "chore: changeset for view status bars"
```

---

## Self-review notes (for the implementer)

- **Spec coverage:** placement (Task 5), map bar groups incl. enable/disable rules (Task 3), tree bar (Task 4), "move most, keep advanced" panel trim (Task 6), live bioregion-colored icons + fuzzy opacity (Task 2), uniform buttons + captions + tooltips (Task 1), backend-overlay removal (Task 5), changeset/build (Task 7).
- **Known follow-ups deferred (non-goals):** no responsive collapsing if the bar is wider than a very narrow viewport (it `flexWrap`s); no settings persistence.
- **Type consistency:** icon prop names (`r1`, `r2`, `ocean`, `name`) are used identically across `icons.tsx` and both composers; store setter names verified against `MapStore`/`InfomapStore`/`TreeStore`.
```
