import { observer } from "mobx-react";
import { VStack } from '@chakra-ui/react';
import { LoadData, LoadExample } from './Load';
import { useStore } from '../../store'

export default observer(function Data() {
  const { speciesStore, treeStore } = useStore();
  return (
    <VStack align="stretch">
      <LoadData />
      <LoadExample />
      <div>Number of occurrences: {speciesStore.numPoints}</div>
      <div>Num nodes in tree: {treeStore.numNodesInTree}</div>
    </VStack>
  );
})