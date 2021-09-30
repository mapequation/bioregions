import { useState } from 'react';
import {
  Flex,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
} from '@chakra-ui/react';
import { extent, range, map, zip } from 'd3';
import { AxisLeft, AxisBottom } from './svg/Axis';
import Curve from './svg/Curve';

export default function TreeWeight() {
  const [weight, setWeight] = useState(0.5);
  const width = 400;
  const height = 250;

  const inputProps = {
    min: 0,
    max: 1,
    step: 0.01,
    value: weight,
  };

  const exp1 = (x: number) => Math.exp(x + 1) - Math.E;
  const w = exp1(exp1(weight));
  const f = (x: number) => x * Math.exp(w * (x - 1));

  const x = range(0, 1, 1000);
  const y = map(x, f);
  const data = zip(x, y) as [number, number][];
  const domain = extent(x) as [number, number];

  return (
    <Flex width={400} flexDirection="column" p={4}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`-40 -20 ${width + 70} ${height + 70}`}
        width={width}
        height={height}
      >
        <AxisLeft domain={[0, 1]} range={[0, height]} label="Link weight" />
        <AxisBottom
          height={height}
          domain={domain}
          range={[0, width]}
          label="Distance"
        />
        <Curve
          data={data}
          xDomain={domain}
          yDomain={[0, 1]}
          width={width}
          height={height}
          strokeWidth="1.5"
        />
      </svg>
      <Flex>
        <NumberInput
          maxW="100px"
          mr={2}
          onChange={(_, value) => setWeight(value)}
          {...inputProps}
        >
          <NumberInputField />
          <NumberInputStepper>
            <NumberIncrementStepper />
            <NumberDecrementStepper />
          </NumberInputStepper>
        </NumberInput>
        <Slider
          aria-label="weight"
          onChange={(weight) => setWeight(weight)}
          {...inputProps}
        >
          <SliderTrack>
            <SliderFilledTrack />
          </SliderTrack>
          <SliderThumb />
        </Slider>
      </Flex>
    </Flex>
  );
}
