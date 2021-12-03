import { VStack } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import Bioregions from './Bioregions';

export default observer(function Statistics() {
  return (
    <VStack>
      <Bioregions />
    </VStack>
  );
});
