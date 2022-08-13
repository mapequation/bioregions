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
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  HStack,
  Flex,
  Box,
} from '@chakra-ui/react';
import { format } from 'd3-format';
import TreeHistogram from '../TreeHistogram';
import Stat from '../Stat';
import NetworkSize from './NetworkSize';
import { useStore } from '../../store';
import DualTreeHistogram from '../DualTreeHistogram';

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
      <DualTreeHistogram
        dataLeft={treeStore.lineagesThroughTime}
        dataRight={infomapStore.linkWeightThroughTime}
        formatTime={treeStore.timeFormatter}
        isDisabled={!infomapStore.network}
        labelLeft="Lineages through time"
        labelRight="Accumulated tree weight"
        yScaleRight="log"
        stepRight={false}
        yTickFormatRight=".2p"
        yMinRight={0.0005}
      />

      <FormControl
        display="flex"
        w="100%"
        alignItems="center"
        isDisabled={!infomapStore.includeTreeInNetwork}
      >
        <FormLabel htmlFor="useWholeTree" mb="0">
          Integrate whole tree
        </FormLabel>
        <Spacer />
        <Switch
          id="useWholeTree"
          isChecked={infomapStore.useWholeTree}
          onChange={() =>
            infomapStore.setUseWholeTree(!infomapStore.useWholeTree, true)
          }
        />
      </FormControl>
      <FormControl
        w="100%"
        isDisabled={
          !infomapStore.includeTreeInNetwork || infomapStore.useWholeTree
        }
      >
        <FormLabel htmlFor="integrationTime" mb="0">
          Integration time
        </FormLabel>
        <HStack>
          <Slider
            w={200}
            isReversed
            isDisabled={
              !infomapStore.includeTreeInNetwork || infomapStore.useWholeTree
            }
            focusThumbOnChange={false}
            value={1 - infomapStore.integrationTime}
            onChange={(value) => infomapStore.setIntegrationTime(1 - value)}
            onChangeEnd={(value) =>
              infomapStore.setIntegrationTime(1 - value, true)
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
          <Tag size="sm">{format('.2~r')(infomapStore.integrationTime)}</Tag>
        </HStack>
      </FormControl>
      <FormControl w="100%" isDisabled={!infomapStore.includeTreeInNetwork}>
        <FormLabel htmlFor="segregationTime" mb="0">
          Segregation time
        </FormLabel>
        <HStack>
          <Slider
            w={200}
            isDisabled={!infomapStore.includeTreeInNetwork}
            focusThumbOnChange={false}
            value={infomapStore.segregationTime}
            onChange={(value) => infomapStore.setSegregationTime(value)}
            onChangeEnd={(value) =>
              infomapStore.setSegregationTime(value, true)
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
          <Tag size="sm">{format('.2~r')(infomapStore.segregationTime)}</Tag>
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
    </VStack>
  );
});
