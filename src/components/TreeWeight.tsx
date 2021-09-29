import { useState } from 'react';
import {
  Box,
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
import { AxisLeft, AxisBottom } from './svg/Axis';
import Curve from './svg/Curve';

export default function TreeWeight() {
  const [weight, setWeight] = useState(0.5);
  const [width, setWidth] = useState(400);
  const [height, setHeight] = useState(250);

  const inputProps = {
    min: 0,
    max: 1,
    step: 0.01,
    value: weight,
  };

  const data: [number, number][] = [];
  const exp1 = (x: number) => Math.exp(x + 1) - Math.E;
  const w = exp1(exp1(weight));

  for (let x = 0; x <= 1; x = x + 0.001) {
    data.push([x, x * Math.exp(w * (x - 1))]);
  }

  const domain: [number, number] = [
    Math.min(data[0][0], data[data.length - 1][0]),
    Math.max(data[0][0], data[data.length - 1][0]),
  ];

  return (
    <Box d="flex" width={400} flexDirection="column" p={4}>
      <Box
        as="svg"
        d="flex"
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
      </Box>
      <Box d="flex">
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
        <NumberInput onChange={(_, value) => setWeight(value)} {...inputProps}>
          <NumberInputField />
          <NumberInputStepper>
            <NumberIncrementStepper />
            <NumberDecrementStepper />
          </NumberInputStepper>
        </NumberInput>
      </Box>
    </Box>
  );
}
