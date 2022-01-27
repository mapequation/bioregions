import { VStack } from '@chakra-ui/react';
import Bioregions from './Bioregions';

export default function Statistics() {
  return (
    <VStack w="100%" gap={4}>
      <Bioregions />
    </VStack>
  );
}
