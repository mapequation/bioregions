import { useCallback } from 'react';
import { observer } from 'mobx-react';
import { Box, Center, Separator, Spinner, VStack } from '@chakra-ui/react';
import { format } from 'd3-format';
import { useStore } from '../../store';
import Stat from '../Stat';
import IntervalSlider from './IntervalSlider';

const formatCellCapacity = format('.0s');

export default observer(function Resolution() {
  const { speciesStore, mapStore, infomapStore } = useStore();
  const { binner } = speciesStore;

  const render = useCallback(async () => {
    await infomapStore.run();
    mapStore.render();
  }, [infomapStore, mapStore]);

  return (
    <VStack align="flex-start" position="relative">
      {infomapStore.isRunning && (
        <Box pos="absolute" inset="0" bg="bg/80">
          <Center h="full">
            <Spinner color="teal.500" />
          </Center>
        </Box>
      )}
      <Box>Cell size</Box>
      <IntervalSlider
        values={binner.cellSizeLog2Range}
        value={binner.cellSizeLog2}
        onChange={([start, stop]) => {
          binner.setCellSizeLog2(start, stop);
          render();
        }}
        valueFormat={(value) =>
          value < 0 ? `1/${2 ** -value}˚` : `${2 ** value}˚`
        }
        disabled={speciesStore.isLoading}
      />
      <Box>Cell capacity</Box>
      <IntervalSlider
        values={binner.cellCapacityRange}
        value={binner.cellCapacity}
        onChange={([start, stop]) => {
          binner.setCellCapacity(start, stop);
          render();
        }}
        valueFormat={formatCellCapacity}
        disabled={speciesStore.isLoading}
      />
      {speciesStore.loaded && (
        <>
          <Separator />
          <Stat label="Grid cells">{binner.cells.length.toLocaleString()}</Stat>
        </>
      )}
    </VStack>
  );
});
