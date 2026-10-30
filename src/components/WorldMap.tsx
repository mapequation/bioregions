import { useEffect, useRef } from 'react';
import { observer } from 'mobx-react';
import { useStore } from '../store/';
import { Box, Button, HStack, Stack, Text } from '@chakra-ui/react';
import { LuSearch } from 'react-icons/lu';
import { LoadData } from './ControlPanel/Load';
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

// Centre card on the empty map: the two ways to get data in.
const EmptyMapCta = observer(function EmptyMapCta() {
  const { speciesStore, explorerStore } = useStore();
  const busy = speciesStore.isLoading || explorerStore.isLoading;
  if (busy || speciesStore.numRecords > 0 || speciesStore.loaded) {
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
      >
        <Box>
          <Text fontWeight="semibold">No data yet</Text>
          <Text fontSize="sm" color="fg.muted">
            Search GBIF and OBIS occurrence records, or load your own file.
          </Text>
        </Box>
        <HStack gap={2} align="stretch">
          <Button size="sm" flex="1" onClick={() => explorerStore.open()}>
            <LuSearch /> Explore GBIF &amp; OBIS
          </Button>
          <Box flex="1">
            <LoadData />
          </Box>
        </HStack>
      </Stack>
    </Box>
  );
});

export default observer(function WorldMap() {
  const hostRef = useRef<HTMLDivElement>(null);
  const { mapStore } = useStore();

  useEffect(() => {
    if (hostRef.current === null) {
      return;
    }

    mapStore.setHost(hostRef.current);
    return () => mapStore.disposeEngine();
  }, [mapStore]);

  return (
    <Box ml={4} width="100%" maxW={`${MAX_WIDTH}px`}>
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
