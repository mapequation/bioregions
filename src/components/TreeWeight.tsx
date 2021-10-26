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
import { observer } from 'mobx-react';
import { AxisLeft, AxisBottom } from './svg/Axis';
import Curve from './svg/Curve';
import { useStore } from '../store';

export default observer(function TreeWeight({
  isDisabled = false,
}: {
  isDisabled?: boolean;
}) {
  const { treeStore } = useStore();
  const width = 250;
  const height = 120;

  const weight = treeStore.weightParameter;
  const { data, domain } = treeStore.weightCurve;

  const inputProps = {
    min: 0,
    max: 1,
    step: 0.01,
    value: weight,
  };

  const color = !isDisabled
    ? 'var(--chakra-colors-gray-800)'
    : 'var(--chakra-colors-gray-300)';

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
          stroke={
            !isDisabled
              ? 'var(--chakra-colors-blue-500)'
              : 'var(--chakra-colors-gray-300)'
          }
        />
      </svg>
      <Flex alignItems="center" justifyContent="center" width="100%">
        <Icon
          viewBox="0 0 63 54"
          mr={2}
          cursor="pointer"
          onClick={() => treeStore.setWeightParameter(0, true)}
        >
          <g
            fill="none"
            stroke={
              !isDisabled
                ? 'var(--chakra-colors-blue-500)'
                : 'var(--chakra-colors-gray-300)'
            }
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect height="36" rx="8" strokeWidth="3" width="45" x="9" y="9" />
            <path d="m18 36 27-18" strokeWidth="4.5" />
          </g>
        </Icon>
        <Slider
          isDisabled={isDisabled}
          aria-label="weight"
          size="sm"
          onChangeEnd={(weight) => treeStore.setWeightParameter(weight, true)}
          onChange={(weight) => treeStore.setWeightParameter(weight)}
          {...inputProps}
        >
          <SliderTrack>
            <SliderFilledTrack />
          </SliderTrack>
          <SliderThumb />
        </Slider>
        <Icon
          viewBox="0 0 63 54"
          ml={2}
          cursor="pointer"
          onClick={() => treeStore.setWeightParameter(1, true)}
        >
          <g
            fill="none"
            stroke={
              !isDisabled
                ? 'var(--chakra-colors-blue-500)'
                : 'var(--chakra-colors-gray-300)'
            }
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect height="36" rx="8" strokeWidth="3" width="45" x="9" y="9" />
            <path d="m45 18c0 10-12.08 18-27 18" strokeWidth="4.5" />
          </g>
        </Icon>
        <NumberInput
          isDisabled={isDisabled}
          maxW="70px"
          size="xs"
          ml={2}
          onChange={(_, value) => treeStore.setWeightParameter(value, true)}
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
