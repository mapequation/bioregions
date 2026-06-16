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
    <rect
      key={`${XY[i][0]}-${XY[i][1]}`}
      x={XY[i][0]}
      y={XY[i][1]}
      width="8"
      height="8"
      fill={f}
    />
  ));
  return clipId ? <g clipPath={`url(#${clipId})`}>{rects}</g> : rects;
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
    const c = d3color(interpolateRgb(r2, r1)(t)); // interpolateRgb(secondColor, firstColor)
    if (!c) {
      throw new Error('Failed to parse interpolated color');
    }
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
    <svg aria-hidden="true" width="24" height="24" viewBox={VB}>
      {pts.map((p) => (
        <circle key={`${p[0]}-${p[1]}`} cx={p[0]} cy={p[1]} r="1.7" fill="red" />
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
    <svg aria-hidden="true" width="24" height="24" viewBox={VB}>
      <Cells fills={ramp} />
    </svg>
  );
}

export function BioregionsIcon({ r1, r2 }: { r1: string; r2: string }) {
  return (
    <svg aria-hidden="true" width="24" height="24" viewBox={VB}>
      <Cells fills={distinctFills(r1, r2)} />
    </svg>
  );
}

export function BoundariesFuzzyIcon({ r1, r2 }: { r1: string; r2: string }) {
  return (
    <svg aria-hidden="true" width="24" height="24" viewBox={VB}>
      <Cells fills={fuzzyFills(r1, r2)} />
    </svg>
  );
}

const LAND = 'M14 0 L24 0 L24 24 L0 24 L0 16 C4 14 5 11 8 10 C11 9 11 4 14 0 Z';
let clipSeq = 0;
export function ClipOnIcon({ r1, r2, ocean }: { r1: string; r2: string; ocean: string }) {
  const id = `sbland${clipSeq++}`;
  return (
    <svg aria-hidden="true" width="24" height="24" viewBox={VB}>
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
      aria-hidden="true"
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
