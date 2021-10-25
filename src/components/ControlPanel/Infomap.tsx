import { observer } from "mobx-react";
import { Button, VStack, FormControl, FormLabel, Spacer, Switch, NumberInput, NumberInputField, NumberInputStepper, NumberIncrementStepper, NumberDecrementStepper, Progress } from '@chakra-ui/react';
import TreeWeight from '../TreeWeight';
import Stat from '../Stat';
import { useStore } from '../../store'

export default observer(function Infomap() {
  const { treeStore, speciesStore, infomapStore, mapStore } = useStore();

  const runInfomap = async () => {
    await infomapStore.run();
    if (mapStore.renderType === 'bioregions') {
      mapStore.render();
    }
  }

  const tagColorScheme = (numTopModules: number) => {
    const colors = ["red", "red", "red", "orange", "yellow", "green"];
    return colors[Math.min(numTopModules, colors.length - 1)];
  }

  return (
    <VStack>
      <FormControl display="flex" w="100%" alignItems="center" isDisabled={infomapStore.isRunning}>
        <FormLabel htmlFor="includeTree" mb="0">
          Include tree
        </FormLabel>
        <Spacer />
        <Switch
          id="includeTree"
          isDisabled={infomapStore.isRunning}
          checked={treeStore.includeTreeInNetwork}
          onChange={() => treeStore.setIncludeTree(!treeStore.includeTreeInNetwork)}
        />
      </FormControl>
      <TreeWeight isDisabled={!treeStore.includeTreeInNetwork || infomapStore.isRunning} />
      <FormControl display="flex" w="100%" alignItems="center" isDisabled={infomapStore.isRunning}>
        <FormLabel htmlFor="trials" mb="0">
          Trials
        </FormLabel>
        <Spacer />
        <NumberInput
          maxW="70px"
          min={1}
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
      <Button
        size="sm"
        w="100%"
        onClick={runInfomap}
        isLoading={infomapStore.isRunning}
        disabled={!speciesStore.loaded || infomapStore.isRunning}
      >
        Run Infomap
      </Button>
      {infomapStore.isRunning &&
        <Progress
          value={infomapStore.currentTrial}
          max={(infomapStore.args.numTrials ?? 0) + 1}
          size="xs"
          w="100%"
          color="blue.500"
        />}
      {infomapStore.tree != null &&
        <Stat label="Bioregions" colorScheme={tagColorScheme(infomapStore.tree.numTopModules)}>{infomapStore.tree.numTopModules.toLocaleString()}</Stat>}
    </VStack>
  );
})