import { useCallback, useState, useEffect } from 'react';
import { observer } from 'mobx-react';
import {
  Box,
  VStack,
  Divider,
  RangeSlider,
  RangeSliderProps,
  RangeSliderTrack,
  RangeSliderFilledTrack,
  RangeSliderThumb,
  HStack,
} from '@chakra-ui/react';
import { format } from 'd3-format';
import { useStore } from '../../store';
import Stat from '../Stat';

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

type SliderProps = {
  values: number[];
  value: [number, number];
  onChange: (value: [number, number]) => void;
  valueFormat?: (value: number) => string;
};

function Slider({
  values,
  value,
  onChange,
  valueFormat = (val) => val.toString(),
  ...props
}: SliderProps & RangeSliderProps) {
  const calcLimits = (values: number[], [start, stop]: [number, number]) => {
    const startIndex = values.indexOf(start);
    const stopIndex = values.indexOf(stop);

    if (startIndex === -1 || stopIndex === -1) {
      throw new Error(
        `Start or end value in (${[start, stop]}) not in domain (${values})`,
      );
    }

    return [startIndex, stopIndex];
  };

  const [limits, setLimits] = useState(calcLimits(values, value));

  useEffect(() => setLimits(calcLimits(values, value)), [values, value]);

  return (
    <HStack w="100%" fontSize="0.875rem">
      <Box minW="4ch">{valueFormat(values[limits[0]])}</Box>
      <RangeSlider
        mx={2}
        min={0}
        max={values.length - 1}
        step={1}
        value={limits}
        onChange={setLimits}
        onChangeEnd={([start, stop]) => onChange([values[start], values[stop]])}
        {...props}
      >
        <RangeSliderTrack>
          <RangeSliderFilledTrack />
        </RangeSliderTrack>
        <RangeSliderThumb index={0} />
        <RangeSliderThumb index={1} />
      </RangeSlider>
      <Box textAlign="right" minW="4ch">
        {valueFormat(values[limits[1]])}
      </Box>
    </HStack>
  );
}
