import { observer } from 'mobx-react';
import { LuDatabase } from 'react-icons/lu';
import { Button, VStack } from '@chakra-ui/react';
import { useStore } from '../../store';
import Stat from '../Stat';
import { Tooltip } from '../ui/tooltip';
import SourceCards from './SourceCards';

const OPEN_TOOLTIP = 'Search GBIF & OBIS, upload files, examples and phylogeny';

export default observer(function Data() {
  const { speciesStore, explorerStore } = useStore();
  return (
    <VStack align="stretch">
      <Tooltip content={OPEN_TOOLTIP} openDelay={300}>
        <Button size="sm" variant="solid" w="full" data-testid="data-open" onClick={() => explorerStore.open()}>
          <LuDatabase /> Data…
        </Button>
      </Tooltip>

      <SourceCards />

      {speciesStore.numRecords > 0 && <Stat label="Time">{speciesStore.seconds.toLocaleString()} s</Stat>}

      {speciesStore.numRecords > 0 && (
        <Stat label="Speed">{Math.round(speciesStore.speed).toLocaleString()} records/s</Stat>
      )}

      {speciesStore.numPointsDebounced > 0 && (
        <Stat label="Point occurrences">{speciesStore.numPointsDebounced.toLocaleString()}</Stat>
      )}

      {speciesStore.numPolygonsDebounced > 0 && (
        <Stat label="Polygons">{speciesStore.numPolygonsDebounced.toLocaleString()}</Stat>
      )}
    </VStack>
  );
});
