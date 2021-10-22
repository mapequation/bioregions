import { useMemo, useCallback } from 'react';
import { observer } from 'mobx-react';
import debounce from 'lodash/debounce';
import { Box, VStack, Flex, Spacer, Text, FormControl, FormLabel } from '@chakra-ui/react';
import { useStore } from '../../store';
import TangleInput, { TangleInputProps } from '../TangleInput';

type MinMaxInputsProps = {
  label: string;
  isDisabled?: boolean;
  minProps: TangleInputProps;
  maxProps: TangleInputProps;
} & Partial<TangleInputProps>;

const MinMaxInputs = ({ label, isDisabled = false, minProps, maxProps, min, max, ...common }: MinMaxInputsProps) => {
  return (
    <FormControl display="flex" w="100%" alignItems="center" isDisabled={isDisabled}>
      <FormLabel htmlFor="clip" mb="0">
        {label}
      </FormLabel>
      <Spacer />
      <Box>
        <Text fontSize="xs" textTransform="uppercase" color={isDisabled ? "var(--chakra-colors-gray-400)" : "var(--chakra-colors-gray-800)"}>
          Min: <TangleInput {...minProps} min={min} {...common} />{' '}
          Max: <TangleInput {...maxProps} max={max} {...common} />
        </Text>
      </Box>
    </FormControl>
  )
}

export default observer(function Resolution() {
  const { speciesStore, mapStore, infomapStore } = useStore();
  const { binner } = speciesStore;

  const formatBinSize = (sizeLog2: number, _: number): string =>
    sizeLog2 < 0 ? `1/${Math.pow(2, -sizeLog2)}` : `${Math.pow(2, sizeLog2)}`;

  const render = useCallback(async () => {
    await infomapStore.run();
    mapStore.render();
  }, [infomapStore, mapStore]);

  const setMinNodeSizeLog2 = useMemo(() => debounce((value) => {
    binner.setMinNodeSizeLog2(value);
    render();
  }, 500), [binner, render]);

  const setMaxNodeSizeLog2 = useMemo(() => debounce((value) => {
    binner.setMaxNodeSizeLog2(value);
    render();
  }, 500), [binner, render]);

  const setLowerThreshold = useMemo(() => debounce((value) => {
    binner.setLowerThreshold(value);
    render();
  }, 500), [binner, render]);

  const setNodeCapacity = useMemo(() => debounce((value) => {
    binner.setNodeCapacity(value);
    render();
  }, 500), [binner, render]);

  return (
    <VStack align="flex-start">
      <Flex w="100%">
        <MinMaxInputs
          isDisabled={speciesStore.isLoading}
          label="Cell size"
          suffix='˚'
          format={formatBinSize}
          speed={0.1}
          min={-3}
          max={6}
          step={1}
          minProps={{
            max: binner.maxNodeSizeLog2,
            value: binner.minNodeSizeLog2,
            onChange: setMinNodeSizeLog2,
          }}
          maxProps={{
            min: binner.minNodeSizeLog2,
            value: binner.maxNodeSizeLog2,
            onChange: setMaxNodeSizeLog2,
          }}
        />
      </Flex>
      <Flex w="100%" alignItems="flex-end">
        <MinMaxInputs
          isDisabled={speciesStore.isLoading}
          label="Cell capacity"
          speed={0.2}
          logScale
          min={0}
          max={1000}
          minProps={{
            max: binner.nodeCapacity,
            value: binner.lowerThreshold,
            onChange: setLowerThreshold,
          }}
          maxProps={{
            min: binner.lowerThreshold,
            value: binner.nodeCapacity,
            onChange: setNodeCapacity,
          }}
        />
      </Flex>
    </VStack>
  );
});
