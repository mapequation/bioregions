import { useCallback } from 'react';
import { observer } from 'mobx-react';
import { Box, VStack, Divider } from '@chakra-ui/react';
import { format } from 'd3-format';
import { useStore } from '../../store';
import Stat from '../Stat';
import Slider from './Slider';

const formatCellCapacity = format('.0s');

export default observer(function Resolution() {
  const { speciesStore, mapStore, infomapStore } = useStore();
  const { binner } = speciesStore;

  const render = useCallback(async () => {
    await infomapStore.run();
    mapStore.render();
  }, [infomapStore, mapStore]);

  return (
    <VStack align="flex-start">
      <Box>Cell size</Box>
      <Slider
        values={binner.cellSizeLog2Range}
        value={binner.cellSizeLog2}
        onChange={([start, stop]) => {
          binner.setCellSizeLog2(start, stop);
          render();
        }}
        valueFormat={(value) =>
          value < 0 ? `1/${Math.pow(2, -value)}˚` : `${Math.pow(2, value)}˚`
        }
        isDisabled={speciesStore.isLoading}
      />
      <Box>Cell capacity</Box>
      <Slider
        values={binner.cellCapacityRange}
        value={binner.cellCapacity}
        onChange={([start, stop]) => {
          binner.setCellCapacity(start, stop);
          render();
        }}
        valueFormat={formatCellCapacity}
        isDisabled={speciesStore.isLoading}
      />
      {speciesStore.loaded && (
        <>
          <Divider />
          <Stat label="Grid cells">{binner.cells.length.toLocaleString()}</Stat>
        </>
      )}
    </VStack>
  );
});
