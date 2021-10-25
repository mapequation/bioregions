import { observer } from "mobx-react";
import { VStack } from '@chakra-ui/react';
import { LoadData, LoadExample } from './Load';
import { useStore } from '../../store'
import Stat from "../Stat";

export default observer(function Data() {
  const { speciesStore, treeStore } = useStore();
  return (
    <VStack align="stretch">
      <LoadData />
      <LoadExample />

      {speciesStore.loaded &&
        <Stat label="Occurrences">{speciesStore.numPoints.toLocaleString()}</Stat>}

      {treeStore.loaded &&
        <Stat label="Tree nodes">{treeStore.numNodesInTree.toLocaleString()}</Stat>}
    </VStack>
  );
})