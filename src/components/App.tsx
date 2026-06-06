import { useEffect, useRef } from 'react';
import { VStack, Box } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import WorldMap from './WorldMap';
import ControlPanel from './ControlPanel';
import { controlPanelWidth } from './ControlPanel/ControlPanel';
import { useStore } from '../store';
import Statistics from './Statistics';
import Documentation from './Documentation';
import ColorMode from './ControlPanel/ColorMode';
import BackendSelect from './BackendSelect';

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
    <Box ml={4} position="relative" width={treeStore.width}>
      <BackendSelect value={treeStore.backend} onChange={treeStore.setBackend} />
      <div
        ref={hostRef}
        style={{
          position: 'relative',
          width: treeStore.width,
          height: treeStore.height,
        }}
      />
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
