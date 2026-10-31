import type { AreaFilter, BBox } from './types';

export const WORLD_BBOX: BBox = [-180, -90, 180, 90];

const fmt = (x: number) => String(Math.round(x * 1e6) / 1e6);

function ring([w, s, e, n]: BBox): string {
  // Counter-clockwise (SW, SE, NE, NW), as GBIF requires.
  return `(${fmt(w)} ${fmt(s)},${fmt(e)} ${fmt(s)},${fmt(e)} ${fmt(n)},${fmt(w)} ${fmt(n)},${fmt(w)} ${fmt(s)})`;
}

/**
 * WKT for a lon/lat box. A box crossing the antimeridian (west > east) becomes a
 * MULTIPOLYGON of its two halves.
 */
export function bboxToWkt(bbox: BBox): string {
  const [w, s, e, n] = bbox;
  if (w > e) {
    return `MULTIPOLYGON((${ring([w, s, 180, n])}),(${ring([-180, s, e, n])}))`;
  }
  return `POLYGON(${ring(bbox)})`;
}

/** WKT for the area, or null when the area is not a geometry (world, countries). */
export function areaToWkt(area: AreaFilter): string | null {
  switch (area.kind) {
    case 'bbox':
      return bboxToWkt(area.bbox);
    case 'wkt':
      return area.wkt;
    default:
      return null;
  }
}

/** The four quadrants of a box (no antimeridian handling; split boxes come from WORLD_BBOX). */
export function bboxQuadrants([w, s, e, n]: BBox): BBox[] {
  const mx = (w + e) / 2;
  const my = (s + n) / 2;
  return [
    [w, s, mx, my],
    [mx, s, e, my],
    [w, my, mx, n],
    [mx, my, e, n],
  ];
}

export function bboxWidth([w, , e]: BBox): number {
  return w > e ? 360 - w + e : e - w;
}

/** Whether a point lies in the box, honouring antimeridian-crossing boxes. */
export function bboxContains([w, s, e, n]: BBox, lon: number, lat: number): boolean {
  if (lat < s || lat > n) {
    return false;
  }
  return w > e ? lon >= w || lon <= e : lon >= w && lon <= e;
}
