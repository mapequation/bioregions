import { observer } from "mobx-react";
import { VStack, FormControl, FormLabel, Spacer, Switch, NumberInput, NumberInputField, NumberInputStepper, NumberIncrementStepper, NumberDecrementStepper, Progress } from '@chakra-ui/react';
import TreeWeight from '../TreeWeight';
import { useStore } from '../../store'

export default observer(function () {
  const { treeStore, speciesStore, infomapStore } = useStore();
  return (
    <VStack>
      <FormControl display="flex" w="100%" alignItems="center" isDisabled={speciesStore.isLoading || infomapStore.isRunning}>
        <FormLabel htmlFor="includeTree" mb="0">
          Include tree
        </FormLabel>
        <Spacer />
        <Switch
          id="includeTree"
          checked={treeStore.includeTreeInNetwork}
          onChange={() => treeStore.toggleIncludeTree()}
        />
      </FormControl>
      <TreeWeight isDisabled={!treeStore.loaded || !treeStore.includeTreeInNetwork} />
      <FormControl display="flex" w="100%" alignItems="center" isDisabled={speciesStore.isLoading || infomapStore.isRunning}>
        <FormLabel htmlFor="trials" mb="0">
          Trials
        </FormLabel>
        <Spacer />
        <NumberInput
          maxW="70px"
          size="xs"
          value={infomapStore.args.numTrials}
          onChange={(value) => infomapStore.setNumTrials(+value)}
        >
          <NumberInputField />
          <NumberInputStepper>
            <NumberIncrementStepper />
            <NumberDecrementStepper />
          </NumberInputStepper>
        </NumberInput>
      </FormControl>
      {infomapStore.isRunning &&
        <Progress
          value={infomapStore.currentTrial}
          max={(infomapStore.args.numTrials ?? 0) + 1}
          size="xs"
          w="100%"
          color="blue.500"
        />}
    </VStack>
  );
})