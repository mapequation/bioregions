import { observer } from 'mobx-react';
import { Button, VStack } from '@chakra-ui/react';
import { LoadData, LoadExample } from './Load';
import { useStore } from '../../store';
import Stat from '../Stat';

export default observer(function Data() {
  const { speciesStore, treeStore } = useStore();
  return (
    <VStack align="stretch">
      <LoadData />
      <LoadExample />

      {speciesStore.isLoading && (
        <Button
          colorScheme="red"
          variant="outline"
          onClick={() => speciesStore.cancelLoad()}
        >
          Cancel
        </Button>
      )}

      {speciesStore.numRecords > 0 && (
        <Stat label="Time">{speciesStore.seconds.toLocaleString()} s</Stat>
      )}

      {speciesStore.numRecords > 0 && (
        <Stat label="Speed">
          {Math.round(speciesStore.speed).toLocaleString()} records/s
        </Stat>
      )}

      {speciesStore.numPointsDebounced > 0 && (
        <Stat label="Point occurrences">
          {speciesStore.numPointsDebounced.toLocaleString()}
        </Stat>
      )}

      {speciesStore.numPolygonsDebounced > 0 && (
        <Stat label="Polygons">
          {speciesStore.numPolygonsDebounced.toLocaleString()}
        </Stat>
      )}

      {treeStore.loaded && (
        <Stat label="Tree nodes">
          {treeStore.numNodesInTree.toLocaleString()}
        </Stat>
      )}
    </VStack>
  );
});
