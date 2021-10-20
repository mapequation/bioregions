import { observer } from 'mobx-react';
import { Button, Box, VStack, Flex, Spacer, Text } from '@chakra-ui/react';
import { useStore } from '../../store';
import TangleInput, { TangleInputProps } from '../TangleInput';

type MinMaxInputsProps = {
  label: string;
  minProps: TangleInputProps;
  maxProps: TangleInputProps;
} & Partial<TangleInputProps>;

const MinMaxInputs = ({ label, minProps, maxProps, min, max, ...common }: MinMaxInputsProps) => {
  return (
    <>
      <Box>{label}</Box>
      <Spacer />
      <Box>
        <Text fontSize="xs" textTransform="uppercase">
          Min: <TangleInput {...minProps} min={min} {...common} />{' '}
          Max: <TangleInput {...maxProps} max={max} {...common} />
        </Text>
      </Box>
    </>
  )
}

export default observer(function Resolution() {
  const { speciesStore, mapStore, infomapStore } = useStore();
  const { binner } = speciesStore;

  const formatBinSize = (sizeLog2: number, _: number): string =>
    sizeLog2 < 0 ? `1/${Math.pow(2, -sizeLog2)}` : `${Math.pow(2, sizeLog2)}`;

  const onClick = async () => {
    await infomapStore.run();
    mapStore.render();
  }

  const onChangeNodeCapacity = (value: number) => {
    console.log("!!! onChangeNodeCapacity", value)
    binner.setNodeCapacity(value);
  }

  return (
    <VStack align="flex-start">
      <Flex w="100%">
        <MinMaxInputs
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
            onChange: (value) => binner.setMinNodeSizeLog2(value),
          }}
          maxProps={{
            min: binner.minNodeSizeLog2,
            value: binner.maxNodeSizeLog2,
            onChange: (value) => binner.setMaxNodeSizeLog2(value),
          }}
        />
      </Flex>
      <Flex w="100%" alignItems="flex-end">
        <MinMaxInputs
          label="Cell capacity"
          speed={0.2}
          logScale
          min={0}
          max={1000}
          minProps={{
            max: binner.nodeCapacity,
            value: binner.lowerThreshold,
            onChange: (value) => binner.setLowerThreshold(value),
          }}
          maxProps={{
            min: binner.lowerThreshold,
            value: binner.nodeCapacity,
            //onChange: (value) => binner.setNodeCapacity(value),
            onChange: (value) => onChangeNodeCapacity(value),
          }}
        />
      </Flex>
      <Button size="sm" onClick={onClick}>Run binner</Button>
    </VStack>
  );
});
