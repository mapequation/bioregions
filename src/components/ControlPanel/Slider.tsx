import { useState, useEffect } from 'react';
import {
  Box,
  RangeSlider,
  RangeSliderProps,
  RangeSliderTrack,
  RangeSliderFilledTrack,
  RangeSliderThumb,
  HStack,
} from '@chakra-ui/react';

type SliderProps = {
  values: number[];
  value: [number, number];
  onChange: (value: [number, number]) => void;
  valueFormat?: (value: number) => string;
};
export default function Slider({
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
      <Box minW="5ch">{valueFormat(values[limits[0]])}</Box>
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
