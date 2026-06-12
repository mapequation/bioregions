import { useEffect, useRef } from 'react';
import { VStack, Box, Text } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import WorldMap from './WorldMap';
import ControlPanel from './ControlPanel';
import { controlPanelWidth } from './ControlPanel/ControlPanel';
import { useStore } from '../store';
import Statistics from './Statistics';
import Documentation from './Documentation';
import ColorMode from './ControlPanel/ColorMode';
import BackendSelect from './BackendSelect';
import { formatThousands } from '../utils/formats';

// Tooltip for the hovered tree branch/node: the clade's reconstructed ancestral range,
// each bioregion sized by its share of the clade's occurrences. The matching bioregions are
// simultaneously emphasized on the map (see TreeStore.onHover / MapStore.highlightBioregions).
const TreeTooltip = observer(function _TreeTooltip() {
  const { treeStore } = useStore();
  const info = treeStore.hoverInfo;
  if (!info) {
    return null;
  }
  const [x, y] = treeStore.hoverPos;
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
      {info.name && (
        <Text fontWeight="600" truncate>
          {info.name}
        </Text>
      )}
      <Text color="gray.500" mb={1}>
        Ancestral range · {formatThousands(info.speciesCount)} tips
      </Text>
      {info.regions.map((r) => (
        <Box key={r.clusterId} display="flex" alignItems="center" gap={1.5}>
          <Box
            w="10px"
            h="10px"
            borderRadius="2px"
            bg={r.color}
            flexShrink={0}
          />
          <Text flex={1}>Bioregion {r.clusterId}</Text>
          <Text color="gray.500">{Math.round(r.fraction * 100)}%</Text>
        </Box>
      ))}
    </Box>
  );
});

const PhyloTree = observer(function _PhyloTree() {
  const { treeStore } = useStore();
  const hostRef = useRef<HTMLDivElement>(null);
  const haveTree = treeStore.haveTree;

  useEffect(() => {
    if (!haveTree || hostRef.current === null) {
      return;
    }
    treeStore.setHost(hostRef.current);
    return () => treeStore.disposeEngine();
  }, [treeStore, haveTree]);

  if (!haveTree) {
    return null;
  }

  return (
    <Box ml={4} width={treeStore.width}>
      <BackendSelect value={treeStore.backend} onChange={treeStore.setBackend} />
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
});

export default observer(function App() {
  return (
    <Box>
      <Box position="fixed" right={0}>
        <ColorMode />
      </Box>
      <ControlPanel />
      <VStack
        flex={1}
        alignItems="flex-start"
        ml={controlPanelWidth + 25}
        pt={5}
        pb={12}
      >
        <WorldMap />
        <PhyloTree />
        <Statistics />
        <Documentation />
      </VStack>
    </Box>
  );
});
