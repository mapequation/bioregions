import { observer } from 'mobx-react';
import {
  Box,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  VStack,
  FormControl,
  FormLabel,
  Spacer,
  Tag,
  Switch,
  Button,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Flex,
} from '@chakra-ui/react';
import { format } from 'd3-format';
import DemoTree from './DemoTree';
import { useDemoStore } from '../../store';
import Stat from '../Stat';
import { useState } from 'react';
import NetworkSize from '../ControlPanel/NetworkSize';
import Modal from '../ControlPanel/Modal';
import Export from '../ControlPanel/Export';
import TreeHistogram from '../TreeHistogram';
import DualTreeHistogram from '../DualTreeHistogram';
import PhylocanvasTree from '../Tree';
// import TreeHistogram from '../TreeHistogram';

export default observer(() => {
  const demoStore = useDemoStore();
  const [beta, setBeta] = useState(0.75);
  const [hideTree, setHideTree] = useState(false);
  const [hideSegregation, setHideSegregation] = useState(false);
  const [isInfomapOutputOpen, setIsInfomapOutputOpen] = useState(false);
  const { treeStore, infomapStore, speciesStore } = demoStore;
  const { tree } = treeStore;

  if (!tree || !speciesStore.loaded) {
    return null;
  }

  const runMultilayerInfomap = async () => {
    if (infomapStore.isRunning) {
      infomapStore.abort();
      return;
    }

    await infomapStore.runMultilayer();
    console.log('Multilayer network:');
    const net = infomapStore.multilayerNetwork!;
    const treeNodesByLayer: Map<number, string[]> = new Map();
    net.intra.forEach(({ layerId, source, target }) => {
      const nodes = treeNodesByLayer.get(layerId) ?? [];
      if (nodes.length === 0) {
        treeNodesByLayer.set(layerId, nodes);
      }
      const sourceName = net.nodes![source].name;
      const targetName = net.nodes![target].name;
      console.log(`Layer ${layerId}: ${sourceName} - ${targetName}`);
    });
  };

  const { integrationTime, segregationTime, network } = infomapStore;
  const formatCodelength = format('.4f');
  const formatPercent = format('.3p');

  const showDeveloperStuff = false;
  const hideIntegration = infomapStore.useWholeTree;

  return (
    <Box>
      <Box w="60%" pos="relative">
        <DemoTree
          beta={beta}
          hideTree={hideTree}
          hideSegregation={hideSegregation}
          hideIntegration={hideIntegration}
        />
        <Box pos="relative" top={-24} mb={-24}>
          {!hideIntegration && (
            <Slider
              w={`${100 * (100 / 144)}%`}
              ml={`${400 / 144}%`}
              isReversed
              min={0}
              max={1}
              step={0.01}
              value={1 - integrationTime}
              onChange={(value) => infomapStore.setIntegrationTime(1 - value)}
              onChangeEnd={(value) => {
                infomapStore.setIntegrationTime(1 - value, true);
                infomapStore.run();
              }}
              colorScheme="blue"
            >
              <SliderTrack>
                <SliderFilledTrack />
              </SliderTrack>
              <SliderThumb />
            </Slider>
          )}
          {!hideSegregation && (
            <Slider
              w={`${100 * (100 / 144)}%`}
              ml={`${400 / 144}%`}
              min={0}
              max={1}
              step={0.01}
              value={segregationTime}
              onChange={infomapStore.setSegregationTime}
              onChangeEnd={(value) => {
                infomapStore.setSegregationTime(value, true);
                infomapStore.run();
              }}
              colorScheme="red"
            >
              <SliderTrack>
                <SliderFilledTrack />
              </SliderTrack>
              <SliderThumb />
            </Slider>
          )}
        </Box>
      </Box>

      <Flex
        mt={4}
        direction={['column-reverse', null, 'row']}
        maxW={750}
        justify="space-between"
      >
        <VStack w={350} align="start">
          <FormControl display="flex" w="100%" alignItems="center">
            <FormLabel htmlFor="treeWeightBalance" mb="0">
              Relative tree strength
            </FormLabel>
            <Spacer />
            <Slider
              id="treeWeightBalance"
              w="30%"
              isDisabled={!infomapStore.includeTreeInNetwork}
              focusThumbOnChange={false}
              value={infomapStore.treeWeightBalance}
              onChange={(value) => infomapStore.setTreeWeightBalance(value)}
              onChangeEnd={(value) => {
                infomapStore.setTreeWeightBalance(value, true);
                infomapStore.run();
              }}
              min={0}
              max={1}
              step={0.01}
            >
              <SliderTrack>
                <SliderFilledTrack />
              </SliderTrack>
              <SliderThumb fontSize="sm" boxSize="16px"></SliderThumb>
            </Slider>
            <Tag size="sm" ml={4}>
              {format('.2~p')(infomapStore.treeWeightBalance)}
            </Tag>
          </FormControl>
          <FormControl display="flex" w="100%" alignItems="center">
            <FormLabel htmlFor="useWholeTree" mb="0">
              Integrate whole tree
            </FormLabel>
            <Spacer />
            <Switch
              id="useWholeTree"
              isChecked={infomapStore.useWholeTree}
              onChange={() => {
                infomapStore.setUseWholeTree(!infomapStore.useWholeTree, true);
                infomapStore.run();
              }}
            />
          </FormControl>
          <VStack w="100%" align="stretch" spacing={2}>
            <VStack w="100%" align="stretch">
              <NetworkSize network={network} />
              <Stat label="Levels">{infomapStore.numLevels}</Stat>
              <Stat label="Bioregions">{infomapStore.numBioregions}</Stat>
              <Stat label="Codelength">
                {formatCodelength(infomapStore.codelength)} bits
              </Stat>
              <Stat label="Codelength savings">
                {formatPercent(infomapStore.relativeCodelengthSavings)}
              </Stat>
            </VStack>
          </VStack>
        </VStack>

        <Box alignSelf="start">
          <DualTreeHistogram
            dataLeft={treeStore.lineagesThroughTime}
            dataRight={infomapStore.linkWeightThroughTime}
            formatTime={treeStore.timeFormatter}
            isDisabled={!infomapStore.network}
            labelLeft="Lineages through time"
            labelRight="Accumulated link weight"
            yScaleRight="linear"
            stepRight={false}
            yTickFormatRight=".2~p"
          />
          {/* {treeStore.treeString != null && infomapStore.haveBioregions && (
            <PhylocanvasTree
              source={treeStore.treeString}
              size={{ width: 600, height: 400 }}
              showLabels
              showLeafLabels
              interactive
              nodeSize={20}
              styleNodeEdges={true}
              // fillColour={treeColor}
              // strokeColour={treeColor}
              // fontColour={treeColor}
              styles={treeStore.nodeStyles}
            />
          )} */}
        </Box>
      </Flex>

      <VStack mt={4} maxW={350} align="start">
        {showDeveloperStuff && (
          <>
            <FormControl display="flex" w="100%" alignItems="center">
              <FormLabel htmlFor="alwaysUseStateNetwork" mb="0">
                Always use state network
              </FormLabel>
              <Spacer />
              <Switch
                id="alwaysUseStateNetwork"
                isChecked={infomapStore.alwaysUseStateNetwork}
                onChange={() => {
                  infomapStore.setAlwaysUseStateNetwork(
                    !infomapStore.alwaysUseStateNetwork,
                  );
                  infomapStore.run();
                }}
              />
            </FormControl>
            <FormControl display="flex" w="100%" alignItems="center">
              <FormLabel htmlFor="uniformTreeLinks" mb="0">
                Uniform tree links
              </FormLabel>
              <Spacer />
              <Switch
                id="uniformTreeLinks"
                isChecked={infomapStore.uniformTreeLinks}
                onChange={() => {
                  infomapStore.setUniformTreeLinks(
                    !infomapStore.uniformTreeLinks,
                    true,
                  );
                  infomapStore.run();
                }}
              />
            </FormControl>
            <FormControl display="flex" w="100%" alignItems="center">
              <FormLabel htmlFor="curveBundleBeta" mb="0">
                Curve bundle strength
              </FormLabel>
              <Spacer />
              <Slider
                id="curveBundleBeta"
                w="30%"
                isDisabled={infomapStore.integrationTime === 1}
                focusThumbOnChange={false}
                value={beta}
                onChange={setBeta}
                min={0}
                max={1}
                step={0.01}
              >
                <SliderTrack>
                  <SliderFilledTrack />
                </SliderTrack>
                <SliderThumb fontSize="sm" boxSize="16px"></SliderThumb>
              </Slider>
              <Tag size="sm" ml={4}>
                {beta}
              </Tag>
            </FormControl>
          </>
        )}
        <FormControl display="flex" w="100%" alignItems="center">
          <FormLabel htmlFor="hideTree" mb="0">
            Hide tree
          </FormLabel>
          <Spacer />
          <Switch
            id="hideTree"
            isChecked={hideTree}
            onChange={() => setHideTree(!hideTree)}
          />
        </FormControl>
        <FormControl display="flex" w="100%" alignItems="center">
          <FormLabel htmlFor="hideSegregation" mb="0">
            Hide segregation
          </FormLabel>
          <Spacer />
          <Switch
            id="hideSegregation"
            isChecked={hideSegregation}
            onChange={() => setHideSegregation(!hideSegregation)}
          />
        </FormControl>

        <FormControl display="flex" w="100%" alignItems="center">
          <FormLabel htmlFor="spatialNormalization" mb="0">
            Rarity order
          </FormLabel>
          <Spacer />
          <Slider
            id="spatialNormalization"
            w="30%"
            focusThumbOnChange={false}
            value={infomapStore.spatialNormalizationOrderForTree}
            onChange={(value) =>
              infomapStore.setSpatialNormalizationOrderForTree(value)
            }
            onChangeEnd={(value) => {
              infomapStore.setSpatialNormalizationOrderForTree(value, true);
              infomapStore.run();
            }}
            min={0}
            max={3}
            step={0.01}
          >
            <SliderTrack>
              <SliderFilledTrack />
            </SliderTrack>
            <SliderThumb fontSize="sm" boxSize="16px"></SliderThumb>
          </Slider>
          <Tag size="sm" ml={4}>
            {infomapStore.spatialNormalizationOrderForTree}
          </Tag>
        </FormControl>

        <Button onClick={() => setIsInfomapOutputOpen(true)}>
          Infomap console
        </Button>

        <FormControl
          display="flex"
          w="100%"
          alignItems="center"
          isDisabled={infomapStore.isRunning}
        >
          <FormLabel mb="0">
            <Button
              size="sm"
              w="100%"
              colorScheme={infomapStore.isRunning ? 'red' : 'gray'}
              variant={infomapStore.isRunning ? 'outline' : 'solid'}
              onClick={runMultilayerInfomap}
              disabled={!infomapStore.network}
            >
              {!infomapStore.isRunning ? 'Run multilayer' : 'Abort'}
            </Button>
          </FormLabel>
          <Spacer />
          <NumberInput
            maxW="70px"
            min={2}
            size="xs"
            value={infomapStore.numLayers}
            onChange={(value) => infomapStore.setNumLayers(+value)}
          >
            <NumberInputField />
            <NumberInputStepper>
              <NumberIncrementStepper />
              <NumberDecrementStepper />
            </NumberInputStepper>
          </NumberInput>
        </FormControl>

        <Modal
          header="Infomap output"
          isOpen={isInfomapOutputOpen}
          onClose={() => setIsInfomapOutputOpen(false)}
          scrollBehavior="inside"
          size="3xl"
        >
          <Box maxW="50%" fontSize="0.8rem">
            <pre>
              {infomapStore.infomapOutput ||
                'Load data and run Infomap to see output here'}
            </pre>
          </Box>
        </Modal>

        <Export rootStore={demoStore} />
      </VStack>
    </Box>
  );
});
