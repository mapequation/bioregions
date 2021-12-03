import { Container, HStack, VStack, Heading } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import WorldMap from './WorldMap';
import ControlPanel from './ControlPanel';
import Tree from './Tree';
import { useStore } from '../store';
import Statistics from './Statistics';

export default observer(function App() {
  const { treeStore } = useStore();
  return (
    <Container maxW="container.xl" pb={12}>
      <Heading as="h1" size="xl" color="gray.700">
        Infomap Bioregions
      </Heading>

      <HStack spacing="30px" alignItems="flex-start">
        <ControlPanel />
        <VStack flex={1}>
          <WorldMap />
          {treeStore.treeString != null && (
            <Tree
              source={treeStore.treeString}
              size={{ width: 600, height: 400 }}
              showLabels
              showLeafLabels
              interactive
            />
          )}
          <Statistics />
        </VStack>
      </HStack>
    </Container>
  );
});
