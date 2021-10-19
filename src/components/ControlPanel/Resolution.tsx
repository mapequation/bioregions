import { observer } from 'mobx-react';
import { Box, VStack, Flex, Spacer, Text } from '@chakra-ui/react';
import { useStore } from '../../store';
import TangleInput, { TangleInputProps } from '../TangleInput';

type TangleInputsProps = {
  label: string;
  minProps: TangleInputProps;
  maxProps: TangleInputProps;
}

const TangleInputs = ({ label, minProps, maxProps }: TangleInputsProps) => {
  return (
    <>
      <Box>{label}</Box>
      <Spacer />
      <Box>
        <Text fontSize="xs" textTransform="uppercase">
          Min: <TangleInput {...minProps} />{' '}
          Max: <TangleInput {...maxProps} />
        </Text>
      </Box>
    </>
  )
}


export default observer(function Resolution() {
  const { speciesStore } = useStore();
  const { binner } = speciesStore;

  const formatBinSize = (sizeLog2: number, _: number): string =>
    sizeLog2 < 0 ? `1/${Math.pow(2, -sizeLog2)}` : `${Math.pow(2, sizeLog2)}`;

  return (
    <VStack align="flex-start">
      <Flex w="100%">
        <TangleInputs
          label="Cell size"
          minProps={{
            suffix: '˚',
            value: binner.minNodeSizeLog2,
            min: -3,
            max: binner.maxNodeSizeLog2,
            format: formatBinSize,
            step: 1,
            speed: 0.1,
            onChange: (value) => binner.setMinNodeSizeLog2(value),
          }}
          maxProps={{
            suffix: '˚',
            value: binner.maxNodeSizeLog2,
            min: binner.minNodeSizeLog2,
            max: 6,
            format: formatBinSize,
            speed: 0.1,
            onChange: (value) => binner.setMaxNodeSizeLog2(value),
          }}
        />
      </Flex>
      <Flex w="100%" alignItems="flex-end">
        <TangleInputs
          label="Cell capacity"
          minProps={{
            value: binner.lowerThreshold,
            min: 0,
            max: binner.nodeCapacity,
            logScale: true,
            speed: 0.2,
            onChange: (value) => binner.setLowerThreshold(value),
          }}
          maxProps={{
            value: binner.nodeCapacity,
            min: binner.lowerThreshold,
            max: 1000,
            logScale: true,
            speed: 0.2,
            onChange: (value) => binner.setNodeCapacity(value),
          }}
        />
      </Flex>
    </VStack>
  );
});
