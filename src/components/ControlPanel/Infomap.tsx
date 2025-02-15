import { observer } from 'mobx-react';
import {
  Tag,
  Button,
  VStack,
  Spacer,
  HStack,
  Flex,
  Box,
  Field,
} from '@chakra-ui/react';
import { format } from 'd3-format';
// import TreeHistogram from '../TreeHistogram';
import Stat from '../Stat';
import NetworkSize from './NetworkSize';
import { useStore } from '../../store';
import DualTreeHistogram from '../DualTreeHistogram';
import { Switch } from '../ui/switch';
import { Slider } from '../ui/slider';
import {
  NumberInputField,
  NumberInputRoot,
} from '@/components/ui/number-input';
import { Progress } from '../Progress';

export default observer(function Infomap() {
  const { infomapStore, treeStore, mapStore } = useStore();
  const { network } = infomapStore;

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

  const tagColorScheme = (numBioregions: number) => {
    switch (numBioregions) {
      case 1:
      case 2:
        return 'red';
      default:
        return 'gray';
    }
  };

  return (
    <VStack w="100%" gap={2}>
      <Field.Root
        display="flex"
        flexDir="row"
        w="100%"
        alignItems="center"
        disabled={infomapStore.isRunning}
      >
        <Field.Label htmlFor="includeTree" mb="0">
          Include tree
        </Field.Label>
        <Spacer />
        <Switch
          id="includeTree"
          disabled={infomapStore.isRunning}
          checked={infomapStore.includeTreeInNetwork}
          onCheckedChange={() =>
            infomapStore.setIncludeTree(!infomapStore.includeTreeInNetwork)
          }
        />
      </Field.Root>
      <DualTreeHistogram
        dataLeft={treeStore.lineagesThroughTime}
        dataRight={infomapStore.linkWeightThroughTime}
        formatTime={treeStore.timeFormatter}
        isDisabled={!infomapStore.network}
        labelLeft="Lineages through time"
        labelRight="Accumulated tree weight"
        yScaleRight="log"
        stepRight={false}
        yTickFormatRight=".2~p"
        yMinRight={0.0005}
      />

      <Field.Root
        display="flex"
        flexDir="row"
        w="100%"
        alignItems="center"
        disabled={!infomapStore.includeTreeInNetwork && !treeStore.haveTree}
      >
        <Field.Label htmlFor="useWholeTree" mb="0">
          Integrate whole tree
        </Field.Label>
        <Spacer />
        <Switch
          id="useWholeTree"
          checked={infomapStore.useWholeTree}
          onCheckedChange={() =>
            infomapStore.setUseWholeTree(!infomapStore.useWholeTree, true)
          }
        />
      </Field.Root>
      <Field.Root
        w="100%"
        disabled={
          !infomapStore.includeTreeInNetwork || infomapStore.useWholeTree
        }
      >
        <Field.Label htmlFor="integrationTime" mb="0">
          Integration time
        </Field.Label>
        <HStack>
          <Slider
            w={200}
            // isReversed
            origin="start" // TODO: should support 'end'
            disabled={
              !infomapStore.includeTreeInNetwork || infomapStore.useWholeTree
            }
            // focusThumbOnChange={false}
            value={[infomapStore.integrationTime]}
            onValueChange={(e) => infomapStore.setIntegrationTime(e.value[0])}
            onValueChangeEnd={(e) =>
              infomapStore.setIntegrationTime(e.value[0], true)
            }
            min={0}
            max={1}
            step={0.01}
          ></Slider>
          <Spacer />
          <Tag.Root size="sm">
            <Tag.Label>
              {format('.2~r')(infomapStore.integrationTime)}
            </Tag.Label>
          </Tag.Root>
        </HStack>
      </Field.Root>
      <Field.Root w="100%" disabled={!infomapStore.includeTreeInNetwork}>
        <Field.Label htmlFor="segregationTime" mb="0">
          Segregation time
        </Field.Label>
        <HStack>
          <Slider
            w={200}
            disabled={!infomapStore.includeTreeInNetwork}
            // focusThumbOnChange={false}
            value={[infomapStore.segregationTime]}
            onValueChange={(e) => infomapStore.setSegregationTime(e.value[0])}
            onValueChangeEnd={(e) =>
              infomapStore.setSegregationTime(e.value[0], true)
            }
            min={0}
            max={1}
            step={0.01}
          ></Slider>
          <Spacer />
          <Tag.Root size="sm">
            <Tag.Label>
              {format('.2~r')(infomapStore.segregationTime)}
            </Tag.Label>
          </Tag.Root>
        </HStack>
      </Field.Root>
      <Field.Root w="100%" disabled={!infomapStore.includeTreeInNetwork}>
        <Field.Label htmlFor="treeWeight" mb="0">
          Tree weight
        </Field.Label>
        <HStack>
          <Slider
            w={200}
            disabled={!infomapStore.includeTreeInNetwork}
            // focusThumbOnChange={false}
            value={[infomapStore.treeWeightBalance]}
            onValueChange={(e) => infomapStore.setTreeWeightBalance(e.value[0])}
            onValueChangeEnd={(e) =>
              infomapStore.setTreeWeightBalance(e.value[0], true)
            }
            min={0}
            max={1}
            step={0.01}
          />
          <Spacer />
          <Tag.Root size="sm" ml={4}>
            <Tag.Label>
              {format('.0%')(infomapStore.treeWeightBalance)}
            </Tag.Label>
          </Tag.Root>
        </HStack>
      </Field.Root>
      <Field.Root
        display="flex"
        flexDir="row"
        w="100%"
        alignItems="center"
        disabled={infomapStore.isRunning}
      >
        <Field.Label htmlFor="trials" mb="0">
          Trials
        </Field.Label>
        <Spacer />
        <NumberInputRoot
          maxW="70px"
          min={1}
          size="xs"
          value={`${infomapStore.args.numTrials}`}
          onValueChange={(e) => infomapStore.setNumTrials(+e.value)}
        >
          <NumberInputField />
        </NumberInputRoot>
      </Field.Root>
      <Button
        size="sm"
        w="100%"
        colorScheme={infomapStore.isRunning ? 'red' : 'gray'}
        variant={infomapStore.isRunning ? 'outline' : 'solid'}
        onClick={runInfomap}
        //isLoading={infomapStore.isRunning}
        disabled={!infomapStore.network}
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
      <NetworkSize network={network} />
      <Stat
        label="Bioregions"
        disabled={infomapStore.isRunning || infomapStore.numBioregions === 0}
        colorScheme={tagColorScheme(infomapStore.numBioregions)}
      >
        {infomapStore.numBioregions.toLocaleString()}
      </Stat>

      {infomapStore.numLevels > 2 && (
        <>
          <Stat label="Hierarchical levels">{infomapStore.numLevels - 1}</Stat>

          <Flex
            w="100%"
            mt={4}
            gap={2}
            alignItems="center"
            style={{ display: 'flex' }}
          >
            <Box minW={110}>Module level</Box>
            <Slider
              mx={1}
              // focusThumbOnChange={false}
              value={[infomapStore.moduleLevel]}
              onValueChange={(e) => infomapStore.setModuleLevel(e.value[0])}
              onValueChangeEnd={(e) => {
                infomapStore.setModuleLevel(e.value[0], true);
                if (mapStore.renderType === 'bioregions') {
                  mapStore.render();
                }
              }}
              min={0}
              max={Math.max(0, infomapStore.numLevels - 2)}
              step={1}
            ></Slider>
            <Tag.Root size="sm" minW={50}>
              <Tag.Label>{infomapStore.moduleLevel}</Tag.Label>
            </Tag.Root>
          </Flex>
        </>
      )}
    </VStack>
  );
});
