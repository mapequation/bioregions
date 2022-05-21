import { observer } from 'mobx-react';
import { Button, Progress, VStack } from '@chakra-ui/react';
import { LoadData, LoadExample } from './Load';
import { useStore } from '../../store';
import Stat from '../Stat';

export default observer(function Data() {
  const { speciesStore, treeStore } = useStore();
  return (
    <VStack align="stretch">
      <LoadData />
      <LoadExample />

      {(treeStore.isLoading || speciesStore.isLoading) && (
        <Progress size="xs" isIndeterminate />
      )}

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

      {treeStore.isLoaded && (
        <Stat label="Species in tree">
          {treeStore.numLeafNodes.toLocaleString()}
        </Stat>
      )}
    </VStack>
  );
});
