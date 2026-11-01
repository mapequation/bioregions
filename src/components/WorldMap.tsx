import { useEffect, useRef } from 'react';
import { observer } from 'mobx-react';
import { reaction } from 'mobx';
import { useStore } from '../store/';
import { Box, Button, Stack, Text } from '@chakra-ui/react';
import { LuArrowRight, LuSearch, LuUpload } from 'react-icons/lu';
import { primaryButtonProps, secondaryButtonProps } from './Explorer/buttonStyles';
import { formatThousands } from '../utils/formats';
import MapStatusBar from './StatusBar/MapStatusBar';
import { ASPECT_RATIO, MAX_WIDTH } from '../responsive';

// Tooltip for the hovered grid cell: id, size/area, and — once bioregions are computed — a
// colored bioregion badge and the clade's oldest tree-node time. Driven by d3gl's native
// `hover` event (clip-aware picking on the cells layer); content is rendered declaratively
// here rather than built imperatively in the store (cf. TreeTooltip in App.tsx).
const MapTooltip = observer(function _MapTooltip() {
  const { mapStore, infomapStore, treeStore, colorStore } = useStore();
  const cell = mapStore.hoverCell;
  if (!cell) {
    return null;
  }
  const [x, y] = mapStore.hoverPos;
  const bioregion = cell.bioregionId
    ? infomapStore.bioregions.find((b) => b.bioregionId === cell.bioregionId)
    : undefined;
  return (
    <Box
      position="absolute"
      left={`${x + 12}px`}
      top={`${y + 12}px`}
      pointerEvents="none"
      bg="rgba(255,255,255,0.96)"
      border="1px solid #cccccc"
      borderRadius="3px"
      px={2}
      py={1}
      fontSize="xs"
      lineHeight="1.4"
      zIndex={10}
      boxShadow="sm"
      maxW="240px"
    >
      <Text fontWeight="600">
        Cell{' '}
        <Text as="span" color="gray.500" fontWeight="400">
          {cell.id}
        </Text>
      </Text>
      <Text color="gray.500">
        {cell.sizeString}×{cell.sizeString} (
        {formatThousands(Math.round(cell.area))} km²)
      </Text>
      {!!cell.bioregionId && (
        <Box display="flex" alignItems="center" gap={1.5} mt={1}>
          <Box
            w="10px"
            h="10px"
            borderRadius="2px"
            bg={colorStore.colorBioregion(cell.bioregionId)}
            flexShrink={0}
          />
          <Text>Bioregion {cell.bioregionId}</Text>
        </Box>
      )}
      {bioregion && (
        <Text color="gray.500">
          Oldest tree node:{' '}
          {treeStore.timeFormatter(bioregion.oldestPhyloNodeTime)} (t=
          {bioregion.oldestPhyloNodeTime.toFixed(2)})
        </Text>
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
    <Box ref={frameRef} ml={4} width="calc(100% - var(--chakra-spacing-4))" maxW={`${MAX_WIDTH}px`}>
      <MapStatusBar />
      {/* Responsive wrapper: fills the available width (capped at MAX_WIDTH) and keeps a
          2:1 box via aspect-ratio. The d3gl host fills it (inset:0) and resizes in place; the
          hover tooltip lives in the same coordinate space as the d3gl pointer offsets. Hover
          outline + selection dimming are handled natively by d3gl on the cells layer. */}
      <Box position="relative" width="100%" aspectRatio={ASPECT_RATIO}>
        <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
        <MapTooltip />
        <EmptyMapCta />
      </Box>
    </Box>
  );
});
