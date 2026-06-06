import { useEffect, useRef } from 'react';
import { observer } from 'mobx-react';
import { useStore } from '../store/';
import { Badge, Box, Card, Heading, Text } from '@chakra-ui/react';
import { formatThousands } from '../utils/formats';
import BackendSelect from './BackendSelect';

const Tooltip = observer(function _Tooltip() {
  const { mapStore, infomapStore, treeStore } = useStore();
  const { tooltipCell: cell } = mapStore;
  const { timeFormatter } = treeStore;

  if (!cell) {
    return null;
  }
  const bioregion = infomapStore.bioregions.find(
    (b) => b.bioregionId === cell.bioregionId,
  );

  const [x, y] = mapStore.tooltipPos;
  return (
    <Box pos="absolute" left={x} top={y} pointerEvents="none">
      <Card.Root bgColor="rgba(255,255,255,0.2)">
        <Card.Header p={2}>
          <Heading size="xs">
            Cell <small style={{ color: '#cccccc' }}>{cell.id}</small>
          </Heading>
          <Text style={{ display: 'inline-block' }}>
            {cell.sizeString}
            <small>×</small>
            {cell.sizeString}
          </Text>
          <Text fontSize="xs" style={{ display: 'inline-block' }}>
            ({formatThousands(Math.round(cell.area))} km²)
          </Text>
        </Card.Header>
        <Card.Body p={2} pt={0}>
          <Box>
            <Badge bgColor={cell.color}>Bioregion {cell.bioregionId}</Badge>
          </Box>
          {bioregion && (
            <Box>
              <Text>
                Oldest tree node:{' '}
                {`${timeFormatter(bioregion.oldestPhyloNodeTime)} (t=${bioregion.oldestPhyloNodeTime.toFixed(2)})`}
              </Text>
            </Box>
          )}
        </Card.Body>
      </Card.Root>
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
    <Box ml={4} position="relative" width={width}>
      <BackendSelect value={mapStore.backend} onChange={mapStore.setBackend} />
      <div
        ref={hostRef}
        style={{ position: 'relative', width, height }}
        onMouseMove={mapStore.onMouseMove}
        onMouseOver={mapStore.onMouseEnter}
        onMouseOut={mapStore.onMouseLeave}
        onClick={mapStore.onMouseClick}
      />
      <Tooltip />
    </Box>
  );
});
