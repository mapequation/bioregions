import { observer } from 'mobx-react';
import {
  Tag,
  Button,
  VStack,
  FormControl,
  FormLabel,
  Spacer,
  Switch,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Progress,
} from '@chakra-ui/react';
import { Table, Thead, Tbody, Tr, Th, Td, Tfoot } from '@chakra-ui/react';
import TreeWeight from '../TreeWeight';
import Stat from '../Stat';
import { useStore } from '../../store';

export default observer(function Infomap() {
  const { treeStore, speciesStore, infomapStore, mapStore } = useStore();
  const { network, tree } = infomapStore;

  const runInfomap = async () => {
    await infomapStore.run();
    if (mapStore.renderType === 'bioregions') {
      mapStore.render();
    }
  };

  const tagColorScheme = (numTopModules: number) => {
    const colors = ['red', 'red', 'gray'];
    return colors[Math.min(numTopModules, colors.length - 1)];
  };

  return (
    <VStack>
      <FormControl
        display="flex"
        w="100%"
        alignItems="center"
        isDisabled={infomapStore.isRunning}
      >
        <FormLabel htmlFor="includeTree" mb="0">
          Include tree
        </FormLabel>
        <Spacer />
        <Switch
          id="includeTree"
          isDisabled={infomapStore.isRunning}
          checked={treeStore.includeTreeInNetwork}
          onChange={() =>
            treeStore.setIncludeTree(!treeStore.includeTreeInNetwork)
          }
        />
      </FormControl>
      <TreeWeight
        isDisabled={!treeStore.includeTreeInNetwork || infomapStore.isRunning}
      />
      <FormControl
        display="flex"
        w="100%"
        alignItems="center"
        isDisabled={infomapStore.isRunning}
      >
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
      {infomapStore.isRunning && (
        <Progress
          value={infomapStore.currentTrial}
          max={(infomapStore.args.numTrials ?? 0) + 1}
          size="xs"
          w="100%"
          color="blue.500"
        />
      )}
      {network != null && !treeStore.includeTreeInNetwork && (
        <>
          <Stat label="Nodes">
            {(network.nodes.length - network.numTreeNodes).toLocaleString()}
          </Stat>
          <Stat label="Links">
            {(network.links.length - network.numTreeLinks).toLocaleString()}
          </Stat>
        </>
      )}
      {network != null && treeStore.includeTreeInNetwork && (
        <Table width="100%" size="sm" variant="simpler">
          <Thead>
            <Tr>
              <Td></Td>
              <Td textAlign="center">Nodes</Td>
              <Td textAlign="center" style={{ paddingInlineEnd: 0 }}>
                Links
              </Td>
            </Tr>
          </Thead>
          <Tbody>
            <Tr>
              <Td>Network</Td>
              <Td isNumeric textAlign="right">
                <Tag size="sm">
                  {(
                    network.nodes.length - network.numTreeNodes
                  ).toLocaleString()}
                </Tag>
              </Td>
              <Td isNumeric textAlign="right" style={{ paddingInlineEnd: 0 }}>
                <Tag size="sm">
                  {(
                    network.links.length - network.numTreeLinks
                  ).toLocaleString()}
                </Tag>
              </Td>
            </Tr>
            <Tr>
              <Td>Tree</Td>
              <Td isNumeric textAlign="right">
                <Tag size="sm">{network.numTreeNodes.toLocaleString()}</Tag>
              </Td>
              <Td isNumeric textAlign="right" style={{ paddingInlineEnd: 0 }}>
                <Tag size="sm">{network.numTreeLinks.toLocaleString()}</Tag>
              </Td>
            </Tr>
          </Tbody>
          <Tfoot>
            <Tr>
              <Td>Total</Td>
              <Td isNumeric textAlign="right">
                <Tag size="sm">{network.nodes.length.toLocaleString()}</Tag>
              </Td>
              <Td isNumeric textAlign="right" style={{ paddingInlineEnd: 0 }}>
                <Tag size="sm">{network.links.length.toLocaleString()}</Tag>
              </Td>
            </Tr>
          </Tfoot>
        </Table>
      )}
      {tree != null && !infomapStore.isRunning && (
        <Stat
          label="Bioregions"
          colorScheme={tagColorScheme(tree.numTopModules)}
        >
          {tree.numTopModules.toLocaleString()}
        </Stat>
      )}
    </VStack>
  );
});
