import { useEffect, useRef } from 'react';
import { observer } from 'mobx-react';
import { geoDistance } from 'd3';
import { useStore } from '../store';

/** Emphasized regions drawn smaller than this (css px) in both dimensions get a ring. */
const RING_MAX_PX = 12;
const RING_RADIUS = 13; // css px (26px across)
const RING_WIDTH = 2; // css px
const RING_HALO = 1.5; // css px on each side of the ring
/** At most this many rings, e.g. while a tree branch emphasizes many regions. */
const MAX_RINGS = 24;
// A light halo in both modes: on the dark map a dark halo would vanish into the dimmed land.
const HALO = {
  light: 'rgba(255, 255, 255, 0.92)',
  dark: 'rgba(255, 255, 255, 0.75)',
};

const prefersReducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** One haloed ring; settles in with a soft pulse when it first appears. */
function Ring({
  x,
  y,
  color,
  halo,
  id,
}: {
  x: number;
  y: number;
  color: string;
  halo: string;
  id: number;
}) {
  const ref = useRef<SVGGElement>(null);
  useEffect(() => {
    if (!ref.current?.animate || prefersReducedMotion()) return;
    ref.current.animate(
      [
        { transform: 'scale(1.8)', opacity: 0 },
        { transform: 'scale(1)', opacity: 1 },
      ],
      { duration: 550, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' },
    );
  }, []);
  return (
    <g transform={`translate(${x} ${y})`}>
      <g
        ref={ref}
        data-testid="region-locator"
        data-bioregion-id={id}
        style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
      >
        <circle
          r={RING_RADIUS}
          fill="none"
          stroke={halo}
          strokeWidth={RING_WIDTH + 2 * RING_HALO}
        />
        <circle
          r={RING_RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={RING_WIDTH}
        />
      </g>
    </g>
  );
}

/** Rings around emphasized (previewed, selected, tree-hovered) bioregions that are too small to
 *  find on the map at the current zoom, e.g. a single grid cell on the world view. An overlay
 *  over the map canvas that follows pan/zoom via `mapStore.viewTransform`; it takes no pointer
 *  events and sits below the hover tooltip. */
export default observer(function RegionLocators() {
  const { mapStore, selectionStore, infomapStore, colorStore } = useStore();
  const set = selectionStore.emphasized;
  const globe = mapStore.projectionName === 'geoOrthographic';
  if (
    set === null ||
    set.size === 0 ||
    mapStore.renderType !== 'bioregions' ||
    // The globe moves by rotating the projection, which the rings can't track per frame.
    (globe && (mapStore.isZooming || mapStore.isFlying))
  ) {
    return null;
  }

  const { k, x, y } = mapStore.viewTransform;
  const { width, height, projection } = mapStore;
  const halo = HALO[mapStore.colorMode];
  // Facing point of the globe; regions on the far side are hidden.
  const [lambda, phi] = projection.rotate();
  const facing: [number, number] = [-lambda, -phi];

  const rings = [];
  for (const b of infomapStore.bioregions) {
    if (rings.length === MAX_RINGS) break;
    if (!set.has(b.bioregionId) || b.numGridCells === 0) continue;
    if (globe && geoDistance(b.centroid, facing) > Math.PI / 2) continue;
    const [x0, y0, x1, y1] = mapStore.regionBounds(b);
    if (!Number.isFinite(x0)) continue;
    if ((x1 - x0) * k >= RING_MAX_PX || (y1 - y0) * k >= RING_MAX_PX) continue;
    const p = projection(b.centroid);
    if (!p) continue;
    const cx = p[0] * k + x;
    const cy = p[1] * k + y;
    if (cx < 0 || cy < 0 || cx > width || cy > height) continue;
    rings.push(
      <Ring
        key={b.bioregionId}
        id={b.bioregionId}
        x={cx}
        y={cy}
        color={colorStore.colorBioregion(b.bioregionId)}
        halo={halo}
      />,
    );
  }
  if (rings.length === 0) return null;

  return (
    <svg
      aria-hidden="true"
      width="100%"
      height="100%"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 1,
      }}
    >
      {rings}
    </svg>
  );
});
