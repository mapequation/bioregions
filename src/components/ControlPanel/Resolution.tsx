import { observer } from 'mobx-react';
import { Box, VStack, Flex, Spacer, Text } from '@chakra-ui/react';
import { useStore } from '../../store';
import TangleInput from '../TangleInput';


export default observer(function Resolution() {
  const { speciesStore } = useStore();
  const { binner } = speciesStore;

  const formatBinSize = (sizeLog2: number, _: number): string =>
    sizeLog2 < 0 ? `1/${Math.pow(2, -sizeLog2)}` : `${Math.pow(2, sizeLog2)}`;

  return (
    <VStack align="flex-start">
      <Flex w="100%">
        <Box>Cell size</Box>
        <Spacer />
        <Box>
          <Text fontSize="xs" textTransform="uppercase">
            Min:{' '}
            <TangleInput
              suffix="˚"
              value={binner.minNodeSizeLog2}
              min={-3}
              max={binner.maxNodeSizeLog2}
              format={formatBinSize}
              step={1}
              speed={0.1}
              onChange={(value) => binner.setMinNodeSizeLog2(value)}
            />{' '}
            Max:{' '}
            <TangleInput
              suffix="˚"
              value={binner.maxNodeSizeLog2}
              min={binner.minNodeSizeLog2}
              max={6}
              format={formatBinSize}
              speed={0.1}
              onChange={(value) => {
                binner.setMaxNodeSizeLog2(value);
              }}
            />
          </Text>
        </Box>
      </Flex>
      <Flex w="100%" alignItems="flex-end">
        <Box>Cell capacity</Box>
        <Spacer />
        <Box>
          <Text fontSize="xs" textTransform="uppercase">
            Min:{' '}
            <TangleInput
              value={binner.lowerThreshold}
              min={0}
              max={binner.nodeCapacity}
              logScale
              speed={0.2}
              onChange={(value) => {
                console.log('binner change min:', value);
                binner.setLowerThreshold(value);
              }}
            />{' '}
            Max:{' '}
            <TangleInput
              value={binner.nodeCapacity}
              min={binner.lowerThreshold}
              max={1000}
              logScale
              speed={0.2}
              onChange={(value) => {
                console.log('binner change max:', value);
                binner.setNodeCapacity(value);
              }}
            />
          </Text>
        </Box>
      </Flex>
    </VStack>
  );
});
