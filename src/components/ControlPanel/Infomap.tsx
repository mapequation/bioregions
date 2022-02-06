import { observer } from 'mobx-react';
import {
  Tag,
  Button,
  Collapse,
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
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  Box,
  Flex,
  HStack,
} from '@chakra-ui/react';
import { format } from 'd3-format';
import { Table, Thead, Tbody, Tr, Td, Tfoot } from '@chakra-ui/react';
import TreeHistogram from '../TreeHistogram';
import Stat from '../Stat';
import { useStore } from '../../store';

const NodesLinksTable = ({
  numNodes,
  numLinks,
  numTreeNodes,
  numTreeLinks,
}: {
  numNodes: number;
  numLinks: number;
  numTreeNodes: number;
  numTreeLinks: number;
}) => {
  return (
    <Table width="100%" size="sm" variant="simpler">
      <Thead>
        <Tr>
          <Td></Td>
          <Td>Nodes</Td>
          <Td>Links</Td>
        </Tr>
      </Thead>
      <Tbody>
        <Tr>
          <Td>Network</Td>
          <Td isNumeric>
            <Tag size="sm">{numNodes.toLocaleString()}</Tag>
          </Td>
          <Td isNumeric>
            <Tag size="sm">{numLinks.toLocaleString()}</Tag>
          </Td>
        </Tr>
        <Tr>
          <Td>Tree</Td>
          <Td isNumeric>
            <Tag size="sm">{numTreeNodes.toLocaleString()}</Tag>
          </Td>
          <Td isNumeric>
            <Tag size="sm">{numTreeLinks.toLocaleString()}</Tag>
          </Td>
        </Tr>
      </Tbody>
      <Tfoot>
        <Tr>
          <Td>Total</Td>
          <Td isNumeric>
            <Tag size="sm">{(numNodes + numTreeNodes).toLocaleString()}</Tag>
          </Td>
          <Td isNumeric>
            <Tag size="sm">{(numLinks + numTreeLinks).toLocaleString()}</Tag>
          </Td>
        </Tr>
      </Tfoot>
    </Table>
  );
};

export default observer(function Infomap() {
  const { speciesStore, infomapStore, mapStore } = useStore();
  const { network, tree } = infomapStore;

  const runInfomap = async () => {
    if (infomapStore.isRunning) {
      infomapStore.abort();
      return;
    }

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
    <VStack w="100%" spacing={2}>
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
          isChecked={infomapStore.includeTreeInNetwork}
          onChange={() =>
            infomapStore.setIncludeTree(!infomapStore.includeTreeInNetwork)
          }
        />
      </FormControl>
      <TreeHistogram
        isDisabled={
          !infomapStore.includeTreeInNetwork || infomapStore.isRunning
        }
      />
      <FormControl w="100%" isDisabled={!infomapStore.includeTreeInNetwork}>
        <FormLabel htmlFor="integrationTime" mb="0">
          Integration time
        </FormLabel>
        <HStack>
          <Slider
            w={200}
            isDisabled={!infomapStore.includeTreeInNetwork}
            focusThumbOnChange={false}
            value={infomapStore.integrationTime}
            onChange={(value) => infomapStore.setIntegrationTime(value)}
            onChangeEnd={(value) =>
              infomapStore.setIntegrationTime(value, true)
            }
            min={0}
            max={1}
            step={0.01}
          >
            <SliderTrack>
              <SliderFilledTrack />
            </SliderTrack>
            <SliderThumb fontSize="sm" boxSize="16px" />
          </Slider>
          <Spacer />
          <Tag size="sm">{format('.2r')(infomapStore.integrationTime)}</Tag>
        </HStack>
      </FormControl>
      <FormControl w="100%" isDisabled={!infomapStore.includeTreeInNetwork}>
        <FormLabel htmlFor="treeWeight" mb="0">
          Tree weight
        </FormLabel>
        <HStack>
          <Slider
            w={200}
            isDisabled={!infomapStore.includeTreeInNetwork}
            focusThumbOnChange={false}
            value={infomapStore.treeWeightBalance}
            onChange={(value) => infomapStore.setTreeWeightBalance(value)}
            onChangeEnd={(value) =>
              infomapStore.setTreeWeightBalance(value, true)
            }
            min={0}
            max={1}
            step={0.01}
          >
            <SliderTrack>
              <SliderFilledTrack />
            </SliderTrack>
            <SliderThumb fontSize="sm" boxSize="16px"></SliderThumb>
          </Slider>
          <Spacer />
          <Tag size="sm" ml={4}>
            {format('.0%')(infomapStore.treeWeightBalance)}
          </Tag>
        </HStack>
      </FormControl>
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
      <FormControl display="none" w="100%" alignItems="center">
        <FormLabel htmlFor="regularized" mb="0">
          Regularized
        </FormLabel>
        <Spacer />
        <Switch
          id="regularized"
          isChecked={infomapStore.args.regularized}
          onChange={() =>
            infomapStore.setRegularized(!infomapStore.args.regularized)
          }
        />
      </FormControl>
      <Collapse
        in={infomapStore.args.regularized}
        animateOpacity
        style={{ width: '100%' }}
      >
        <Flex w="100%" pl={2} py={2}>
          <Box w="50%" fontSize="0.9rem">
            Strength
          </Box>
          <Slider
            w="50%"
            isDisabled={!infomapStore.args.regularized}
            focusThumbOnChange={false}
            value={infomapStore.args.regularizationStrength}
            onChange={(value) => infomapStore.setRegularizationStrength(value)}
            min={0}
            max={5}
            step={0.01}
          >
            <SliderTrack>
              <SliderFilledTrack />
            </SliderTrack>
            <SliderThumb fontSize="sm" boxSize="32px">
              {infomapStore.args.regularizationStrength}
            </SliderThumb>
          </Slider>
        </Flex>
      </Collapse>
      <Button
        size="sm"
        w="100%"
        colorScheme={infomapStore.isRunning ? 'red' : 'gray'}
        variant={infomapStore.isRunning ? 'outline' : 'solid'}
        onClick={runInfomap}
        //isLoading={infomapStore.isRunning}
        disabled={!speciesStore.loaded}
      >
        {!infomapStore.isRunning ? 'Run Infomap' : 'Abort'}
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
      {network != null && !infomapStore.includeTreeInNetwork && (
        <>
          <Stat label="Nodes">
            {(network.nodes.length - network.numTreeNodes).toLocaleString()}
          </Stat>
          <Stat label="Links">
            {(network.links.length - network.numTreeLinks).toLocaleString()}
          </Stat>
        </>
      )}
      {network != null && infomapStore.includeTreeInNetwork && (
        <NodesLinksTable
          numNodes={network.nodes.length - network.numTreeNodes}
          numLinks={network.links.length - network.numTreeLinks}
          numTreeNodes={network.numTreeNodes}
          numTreeLinks={network.numTreeLinks}
        />
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
