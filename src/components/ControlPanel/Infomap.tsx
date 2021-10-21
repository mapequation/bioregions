import { observer } from "mobx-react";
import { VStack, FormControl, FormLabel, Spacer, Switch, Box } from '@chakra-ui/react';
import TreeWeight from '../TreeWeight';
import { useStore } from '../../store'

export default observer(function () {
  const { treeStore } = useStore();
  return (
    <VStack>
      <FormControl display="flex" w="100%" alignItems="center" isDisabled={!treeStore.loaded}>
        <FormLabel htmlFor="includeTree" mb="0">
          Include tree
        </FormLabel>
        <Spacer />
        <Switch
          id="includeTree"
          checked={treeStore.includeTreeInNetwork}
          onChange={() => treeStore.toggleIncludeTree()}
          isDisabled={!treeStore.loaded}
        />
      </FormControl>
      <Box>
        <TreeWeight />
      </Box>
    </VStack>
  );
})