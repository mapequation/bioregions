import { useState } from 'react';
import { observer } from 'mobx-react';
import {
  Icon,
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
import { useStore } from '../store';

export default observer(function TreeWeight() {
  const { treeStore } = useStore();
  const [weight, setWeight] = useState(0.5);
  const width = 250;
  const height = 120;

  const inputProps = {
    min: 0,
    max: 1,
    step: 0.01,
    value: weight,
  };

  const exp1 = (x: number) => Math.exp(x + 1) - Math.E;
  const w = exp1(exp1(weight));
  const f = (x: number) => x * Math.exp(w * (x - 1));

  const x = range(0, 1, 0.001);
  const y = map(x, f);
  const data = zip(x, y) as [number, number][];
  const domain = extent(x) as [number, number];

  const enabled = treeStore.loaded && treeStore.includeTreeInNetwork;

  const color = enabled ? "var(--chakra-colors-gray-800)" : "var(--chakra-colors-gray-300)";

  return (
    <Flex w="100%" flexDirection="column" p={4}>
      <svg
        style={{ color, stroke: color }}
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
          label="Tree distance"
        />
        <Curve
          data={data}
          xDomain={domain}
          yDomain={[0, 1]}
          width={width}
          height={height}
          strokeWidth="2"
          stroke={enabled ? "var(--chakra-colors-blue-500)" : "var(--chakra-colors-gray-300)"}
        />
      </svg>
      <Flex alignItems="center">
        <Icon viewBox="0 0 63 54" mr={2} cursor="pointer" onClick={() => setWeight(0)}>
          <g fill="none" stroke={enabled ? "var(--chakra-colors-blue-500)" : "var(--chakra-colors-gray-300)"} stroke-linecap="round" stroke-linejoin="round">
            <rect height="36" rx="8" stroke-width="3" width="45" x="9" y="9" />
            <path d="m18 36 27-18" stroke-width="4.5" />
          </g>
        </Icon>
        <Slider
          isDisabled={!enabled}
          aria-label="weight"
          size="sm"
          onChange={(weight) => setWeight(weight)}
          {...inputProps}
        >
          <SliderTrack>
            <SliderFilledTrack />
          </SliderTrack>
          <SliderThumb />
        </Slider>
        <Icon viewBox="0 0 63 54" ml={2} cursor="pointer" onClick={() => setWeight(1)}>
          <g fill="none" stroke={enabled ? "var(--chakra-colors-blue-500)" : "var(--chakra-colors-gray-300)"} stroke-linecap="round" stroke-linejoin="round">
            <rect height="36" rx="8" stroke-width="3" width="45" x="9" y="9" />
            <path d="m45 18c0 10-12.08 18-27 18" stroke-width="4.5" />
          </g>
        </Icon>
        <NumberInput
          isDisabled={!enabled}
          maxW="70px"
          size="xs"
          ml={2}
          onChange={(_, value) => setWeight(value)}
          {...inputProps}
        >
          <NumberInputField />
          <NumberInputStepper>
            <NumberIncrementStepper />
            <NumberDecrementStepper />
          </NumberInputStepper>
        </NumberInput>
      </Flex>
    </Flex>
  );
});
