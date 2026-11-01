import { useEffect, useLayoutEffect, useRef } from 'react';
import { observer } from 'mobx-react';
import { reaction } from 'mobx';
import { useStore } from '../store/';
import { Box, Button, Stack, Text } from '@chakra-ui/react';
import { LuArrowRight, LuSearch, LuUpload } from 'react-icons/lu';
import { primaryButtonProps, secondaryButtonProps } from './Explorer/buttonStyles';
import { formatThousands } from '../utils/formats';
import { BOUNDARY_SHARE, cellMembership } from '../utils/membership';
import { HEATMAP_TARGET_NAME } from '../store/MapStore';
import type { Cell } from '../utils/QuadTree';
import MapStatusBar from './StatusBar/MapStatusBar';
import MapLegend from './MapLegend';
import RegionLocators from './RegionLocators';
import { useColorMode } from './ui/color-mode';
import { formatFlow } from './Statistics/format';
import { ASPECT_RATIO, MAX_WIDTH } from '../responsive';

// Cell.sizeString uses a ring-above (˚); the tooltip's coordinates use a proper degree sign.
const cellSize = (cell: Cell) => cell.sizeString.replace('˚', '°');

const OFFSET = 12;
const TOP_SPECIES = 3;

const pct = (share: number) => `${Math.round(share * 100)}%`;

/** "1 cell", "1,204 cells"; `species` is its own plural. */
const count = (n: number, one: string, many = `${one}s`) =>
  `${formatThousands(n)} ${n === 1 ? one : many}`;

function formatLatLon([lon, lat]: [number, number]) {
  const ns = `${Math.abs(lat).toFixed(1)}°${lat < 0 ? 'S' : 'N'}`;
  const ew = `${Math.abs(lon).toFixed(1)}°${lon < 0 ? 'W' : 'E'}`;
  return `${ns} ${ew}`;
}

// Heatmap metrics span counts (richness), densities (records/km²) and 0..1 indices.
function formatMetric(v: number) {
  if (Math.abs(v) >= 100) return formatThousands(Math.round(v));
  if (Math.abs(v) >= 1) return v.toFixed(1).replace(/\.0$/, '');
  return v === 0 ? '0' : v.toPrecision(2);
}

const Swatch = ({ color, size = 10 }: { color: string; size?: number }) => (
  <Box
    w={`${size}px`}
    h={`${size}px`}
    borderRadius="2px"
    bg={color}
    flexShrink={0}
    boxShadow="inset 0 0 0 1px rgba(0,0,0,0.15)"
  />
);

const Rule = () => <Box borderTopWidth="1px" borderColor="border" my={1.5} />;

/** The cell's own facts: size/area/position, records + species, and the heatmap metric. */
const CellSection = observer(function _CellSection({ cell }: { cell: Cell }) {
  const { mapStore } = useStore();
  const metric =
    mapStore.renderType === 'heatmap'
      ? mapStore.heatmapValue(cell)
      : Number.NaN;
  return (
    <>
      <Text color="fg">
        Cell {cellSize(cell)}×{cellSize(cell)} ·{' '}
        {formatThousands(Math.round(cell.area))} km² ·{' '}
        {formatLatLon(cell.center)}
      </Text>
      <Text color="fg.muted">
        {count(cell.features.length, 'record')} ·{' '}
        {count(cell.speciesRichness, 'species', 'species')}
      </Text>
      {Number.isFinite(metric) && (
        <Text color="fg.muted">
          {HEATMAP_TARGET_NAME[mapStore.heatmapTarget]}
          {mapStore.heatmapTarget === 'records' ? ' per km²' : ''}:{' '}
          <Text as="span" color="fg">
            {formatMetric(metric)}
          </Text>
        </Text>
      )}
    </>
  );
});

/** Stacked strip of the cell's fuzzy bioregion shares, with the leading shares as a legend.
 *  The share is the cell's state-node flow per bioregion (state/multilayer networks) or its
 *  link flow to species of each bioregion (bipartite), see `cellMembership`. */
const Membership = observer(function _Membership({ cell }: { cell: Cell }) {
  const { colorStore } = useStore();
  const shares = cellMembership(cell);
  if (shares.length < 2) return null;
  const boundary = shares[0].share < BOUNDARY_SHARE;
  const listed = shares.slice(0, 3).filter((s) => s.share >= 0.005);
  const source =
    cell.overlappingBioregions.bioregionIds.size > 0 ? 'flow' : 'link flow';
  return (
    <Box mt={1}>
      <Box
        display="flex"
        flexWrap="wrap"
        alignItems="center"
        columnGap={1.5}
        rowGap={0.5}
      >
        <Text color="fg.muted">Membership (share of the cell's {source})</Text>
        {boundary && (
          <Box
            px={1}
            borderWidth="1px"
            borderColor="border.emphasized"
            borderRadius="sm"
            fontSize="10px"
            color="fg.muted"
            whiteSpace="nowrap"
          >
            Boundary cell
          </Box>
        )}
      </Box>
      <Box
        display="flex"
        h="6px"
        my={1}
        borderRadius="2px"
        overflow="hidden"
        bg="bg.muted"
      >
        {shares.map((s) => (
          <Box
            key={s.bioregionId}
            h="100%"
            flex={`${s.share} 0 0`}
            bg={colorStore.colorBioregion(s.bioregionId)}
          />
        ))}
      </Box>
      <Box
        display="flex"
        flexWrap="wrap"
        alignItems="center"
        columnGap={2.5}
        color="fg.muted"
      >
        {listed.map((s) => (
          <Box key={s.bioregionId} display="flex" alignItems="center" gap={1}>
            <Swatch color={colorStore.colorBioregion(s.bioregionId)} size={8} />
            <Text as="span" color="fg" fontWeight="600">
              {s.bioregionId}
            </Text>
            {pct(s.share)}
          </Box>
        ))}
        {shares.length > listed.length && (
          <Text as="span">+{shares.length - listed.length} more</Text>
        )}
      </Box>
    </Box>
  );
});

// Tooltip for the hovered grid cell, region facts first: the cell's bioregion (share of flow,
// size), then the cell itself (size/position, records, fuzzy membership, top species), then a
// hint for what a click does. Before Infomap has run only the cell section shows. Driven by
// d3gl's native `hover` event (clip-aware picking on the cells layer) and placed 12px from the
// pointer, flipped to stay inside the map box; hidden while the user drags or wheel-zooms.
const MapTooltip = observer(function _MapTooltip() {
  const { mapStore, infomapStore, treeStore, colorStore, selectionStore } =
    useStore();
  const ref = useRef<HTMLDivElement>(null);
  const hover = mapStore.isZooming ? null : mapStore.hoverCell;
  // Stay out of the way over the cell just clicked (the store clears this on the next cell).
  const cell = hover?.id === mapStore.clickedCellId ? null : hover;
  const [x, y] = mapStore.hoverPos;

  // Place after layout so the flip uses the tooltip's measured size (no extra React render).
  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.offsetParent as HTMLElement | null | undefined;
    if (!el || !box) return;
    const { offsetWidth: w, offsetHeight: h } = el;
    const left =
      x + OFFSET + w > box.clientWidth
        ? Math.max(0, x - OFFSET - w)
        : x + OFFSET;
    const top =
      y + OFFSET + h > box.clientHeight
        ? Math.max(0, y - OFFSET - h)
        : y + OFFSET;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.visibility = 'visible';
  });

  if (!cell) {
    return null;
  }
  const id = cell.bioregionId;
  const bioregion = id
    ? infomapStore.bioregions.find((b) => b.bioregionId === id)
    : undefined;
  let totalFlow = 0;
  if (bioregion) for (const b of infomapStore.bioregions) totalFlow += b.flow;
  const top = cell.speciesTopList.slice(0, TOP_SPECIES);
  const more = cell.speciesRichness - top.length;
  const selected = selectionStore.selectedId;

  return (
    <Box
      ref={ref}
      data-testid="map-tooltip"
      role="tooltip"
      position="absolute"
      left={0}
      top={0}
      visibility="hidden"
      pointerEvents="none"
      bg="bg.panel"
      color="fg"
      borderWidth="1px"
      borderColor="border"
      borderRadius="md"
      boxShadow="md"
      px={2.5}
      py={2}
      fontSize="xs"
      lineHeight="1.45"
      zIndex={10}
      maxW="300px"
      css={{ fontVariantNumeric: 'tabular-nums' }}
    >
      {bioregion && (
        <>
          <Box display="flex" alignItems="center" gap={1.5}>
            <Swatch
              color={colorStore.colorBioregion(bioregion.bioregionId)}
              size={12}
            />
            <Text fontWeight="600" flex={1}>
              Bioregion {bioregion.bioregionId}
            </Text>
            {totalFlow > 0 && (
              <Text color="fg.muted" whiteSpace="nowrap">
                {formatFlow(bioregion.flow / totalFlow)} of flow
              </Text>
            )}
          </Box>
          {/* Each stat stays whole; lines wrap only at the separators. */}
          <Text color="fg.muted" css={{ '& > span': { whiteSpace: 'nowrap' } }}>
            <span>{count(bioregion.numRecords, 'record')} ·</span>{' '}
            <span>
              {count(bioregion.numSpecies, 'species', 'species')} ·
            </span>{' '}
            <span>
              {count(bioregion.numGridCells, 'cell')}
              {bioregion.numFoundOnlyHere > 0 && ' ·'}
            </span>
            {bioregion.numFoundOnlyHere > 0 && (
              <>
                {' '}
                <span>
                  {formatThousands(bioregion.numFoundOnlyHere)} only here
                </span>
              </>
            )}
          </Text>
          {treeStore.haveTree &&
            Number.isFinite(bioregion.oldestPhyloNodeTime) && (
              <Text color="fg.muted">
                Oldest lineage{' '}
                <Text as="span" color="fg">
                  {treeStore.timeFormatter(bioregion.oldestPhyloNodeTime)}
                </Text>{' '}
                (tree time units)
              </Text>
            )}
          <Rule />
        </>
      )}
      <CellSection cell={cell} />
      {bioregion && <Membership cell={cell} />}
      {top.length > 0 && (
        <Box mt={1}>
          <Text color="fg.muted">Top species (records)</Text>
          {/* One species per row: italic name, record count right-aligned. */}
          {top.map((s) => (
            <Box key={s.name} display="flex" gap={2}>
              <Text flex={1} minW={0} truncate fontStyle="italic">
                {s.name}
              </Text>
              <Text color="fg.muted" fontVariantNumeric="tabular-nums">
                {formatThousands(s.count)}
              </Text>
            </Box>
          ))}
          {more > 0 && (
            <Text color="fg.muted">+{formatThousands(more)} more</Text>
          )}
        </Box>
      )}
      {bioregion && (
        <>
          <Rule />
          <Text fontSize="11px" color="fg.muted">
            {selected === null
              ? 'Click to select'
              : selected === id
                ? 'Click to deselect'
                : `Click to select Bioregion ${id} instead`}
          </Text>
        </>
      )}
    </Box>
  );
});

// Centre card on the empty map: the ways to get data in, one full-width button each, so every
// label keeps its padding at any card width.
const EmptyMapCta = observer(function EmptyMapCta() {
  const { dataStore, explorerStore } = useStore();
  if (dataStore.isLoading || dataStore.occurrence != null) {
    return null;
  }
  return (
    <Box position="absolute" inset={0} display="flex" alignItems="center" justifyContent="center" pointerEvents="none" zIndex={5}>
      <Stack
        pointerEvents="auto"
        gap={3}
        p={5}
        w="340px"
        maxW="calc(100% - 32px)"
        bg="bg"
        borderWidth="1px"
        borderRadius="lg"
        boxShadow="md"
        data-testid="empty-map-cta"
      >
        <Box>
          <Text fontWeight="semibold">No data yet</Text>
          <Text fontSize="sm" color="fg.muted">
            Search GBIF and OBIS, upload your own files, or start from an example.
          </Text>
        </Box>
        <Stack gap={2}>
          <Button {...primaryButtonProps} w="full" onClick={() => explorerStore.open('search')}>
            <LuSearch /> Search GBIF &amp; OBIS
          </Button>
          <Button {...secondaryButtonProps} w="full" onClick={() => explorerStore.open('upload')}>
            <LuUpload /> Upload files
          </Button>
          <Button
            variant="plain"
            size="sm"
            alignSelf="center"
            color="fg.muted"
            _hover={{ color: 'fg', textDecoration: 'underline' }}
            onClick={() => explorerStore.open('examples')}
          >
            Try an example <LuArrowRight />
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
});

export default observer(function WorldMap() {
  const hostRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const { mapStore, explorerStore, speciesStore, dataStore } = useStore();
  const { colorMode } = useColorMode();

  // Declared before the host effect so the first paint already uses the mode's base colors.
  useEffect(() => {
    mapStore.setColorMode(colorMode === 'dark' ? 'dark' : 'light');
  }, [mapStore, colorMode]);

  useEffect(() => {
    if (hostRef.current === null) {
      return;
    }

    mapStore.setHost(hostRef.current);
    return () => mapStore.disposeEngine();
  }, [mapStore]);

  // Frame every newly loaded dataset (explorer, example or file) once binning is done. The fit
  // waits for layout to settle (MapStore.scheduleFitToData) and repeats on later resizes until
  // the user pans or zooms, so the whole loaded extent stays in view.
  useEffect(
    () =>
      reaction(
        () => speciesStore.isLoading,
        (loading, wasLoading) => {
          if (wasLoading && !loading) mapStore.scheduleFitToData();
        },
      ),
    [mapStore, speciesStore],
  );

  // Closing the explorer after a load ("View bioregions" or close) brings the map back into view
  // and re-frames it: the page under the dialog may have scrolled or reflowed meanwhile.
  useEffect(() => {
    let seenSource = dataStore.occurrence?.id;
    let frame = 0;
    const dispose = reaction(
      () => explorerStore.isOpen,
      (shown) => {
        const source = dataStore.occurrence;
        if (shown || !source || source.id === seenSource) return;
        seenSource = source.id;
        if (speciesStore.numRecords === 0) return;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          const box = frameRef.current;
          if (box !== null) {
            const top = box.getBoundingClientRect().top;
            if (top < 0 || top > window.innerHeight / 2) {
              const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
              window.scrollTo({ top: Math.max(0, window.scrollY + top - 20), behavior: reduce ? 'auto' : 'smooth' });
            }
          }
          mapStore.scheduleFitToData();
        });
      },
    );
    return () => {
      dispose();
      cancelAnimationFrame(frame);
    };
  }, [mapStore, explorerStore, speciesStore, dataStore]);

  return (
    // Width leaves room for the left margin, so the map never runs 16px past the viewport.
    <Box ref={frameRef} id="world-map" ml={4} width="calc(100% - var(--chakra-spacing-4))" maxW={`${MAX_WIDTH}px`}>
      <MapStatusBar />
      {/* Responsive wrapper: fills the available width (capped at MAX_WIDTH) and keeps a
          2:1 box via aspect-ratio. The d3gl host fills it (inset:0) and resizes in place; the
          hover tooltip lives in the same coordinate space as the d3gl pointer offsets. Hover
          outline + selection dimming are handled natively by d3gl on the cells layer. */}
      <Box position="relative" width="100%" aspectRatio={ASPECT_RATIO}>
        <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
        <RegionLocators />
        <MapTooltip />
        <EmptyMapCta />
        <MapLegend />
      </Box>
    </Box>
  );
});
