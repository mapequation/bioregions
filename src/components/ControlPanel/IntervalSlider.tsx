import { useState, useEffect } from 'react';
import { Box, HStack } from '@chakra-ui/react';
import { Slider as CSlider } from '../ui/slider';

type SliderProps = {
  values: number[];
  value: [number, number];
  onChange: (value: [number, number]) => void;
  valueFormat?: (value: number) => string;
  disabled?: boolean;
};
export default function Slider({
  values,
  value,
  onChange,
  valueFormat = (val) => val.toString(),
  disabled,
  ...props
}: SliderProps) {
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
      <CSlider
        mx={2}
        w="100%"
        disabled={disabled}
        min={0}
        max={Math.max(0, values.length - 1)}
        step={1}
        value={limits}
        onValueChange={(e) => setLimits(e.value)}
        onValueChangeEnd={(e) =>
          onChange([0, 1].map((i) => values[e.value[i]]) as [number, number])
        }
        {...props}
      />
      <Box textAlign="right" minW="4ch">
        {valueFormat(values[limits[1]])}
      </Box>
    </HStack>
  );
}
