import { useEffect, useRef } from 'react';
import { observer } from 'mobx-react';
import { useStore } from '../store/';
import { Box, Text } from '@chakra-ui/react';
import { formatThousands } from '../utils/formats';
import BackendSelect from './BackendSelect';

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

export default observer(function WorldMap() {
  const hostRef = useRef<HTMLDivElement>(null);
  const { mapStore } = useStore();
  const { width, height } = mapStore;

  useEffect(() => {
    if (hostRef.current === null) {
      return;
    }

    mapStore.setHost(hostRef.current);
    return () => mapStore.disposeEngine();
  }, [mapStore]);

  return (
    <Box ml={4} width={width}>
      <BackendSelect value={mapStore.backend} onChange={mapStore.setBackend} />
      {/* Relative wrapper sized to the canvas: the hover tooltip is positioned in the same
          coordinate space as the d3gl pointer offsets. Hover outline + selection dimming are
          handled natively by d3gl on the cells layer (see MapStore.buildLayers). */}
      <Box position="relative" width={width} height={height}>
        <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
        <MapTooltip />
      </Box>
    </Box>
  );
});
