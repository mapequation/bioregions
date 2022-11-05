import { useState } from 'react';
import { observer } from 'mobx-react';
import {
  Button,
  VStack,
  Progress,
  FormControl,
  FormLabel,
  Spacer,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Switch,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  Flex,
  Box,
  Collapse,
  Tag,
} from '@chakra-ui/react';
import { useStore } from '../../store';
import { range, format } from 'd3';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import Stat from '../Stat';
import Modal from './Modal';
import { saveCanvas } from '../../utils/exporter';

export default observer(function Advanced() {
  const [isRunning, setIsRunning] = useState(false);
  const [steps, setSteps] = useState(5);
  const [step, setStep] = useState(0);
  const [isInfomapOutputOpen, setIsInfomapOutputOpen] = useState(false);
  const [show, setShow] = useState(process.env.NODE_ENV === 'development');
  const { speciesStore, treeStore, infomapStore, mapStore } = useStore();

  const paramSweepIntegrationTime = async () => {
    setIsRunning(true);

    try {
      const zip = new JSZip();

      infomapStore.setIncludeTree();

      const times = range(steps).map((i) => i / (steps - 1));
      const { timeFormatter } = treeStore;

      for (let i = 0; i < times.length; i++) {
        setStep(i);
        const t = times[i];
        infomapStore.setIntegrationTime(t);

        await infomapStore.run();

        if (mapStore.renderType === 'bioregions') {
          mapStore.render();
        }

        const name = `${timeFormatter(t)} Ma`;

        await saveCanvas(mapStore.canvas!, `${name}.png`);
        //@ts-ignore
        infomapStore.tree!.name = name;
        const filename = `${name}.json`;
        zip.file(filename, JSON.stringify(infomapStore.tree)!);
      }

      const zipFile = await zip.generateAsync({ type: 'blob' });
      saveAs(zipFile, 'sweep integration time.zip');
    } catch (err) {
      console.error('Error in parameter sweep:', err);
    }

    setIsRunning(false);
  };

  const paramSweepNumIterations = async () => {
    setIsRunning(true);

    try {
      const zip = new JSZip();

      const numIterations = range(steps).map((i) => i);

      for (let i = 0; i < numIterations.length; i++) {
        setStep(i);
        const N = numIterations[i] + 1;
        infomapStore.setNumTrials(N);

        await infomapStore.run();

        if (mapStore.renderType === 'bioregions') {
          mapStore.render();
        }

        const filename = `N ${N}.json`;
        zip.file(filename, JSON.stringify(infomapStore.tree)!);
      }

      const zipFile = await zip.generateAsync({ type: 'blob' });
      saveAs(zipFile, 'sweep num trials.zip');
    } catch (err) {
      console.error('Error in parameter sweep:', err);
    }

    setIsRunning(false);
  };

  const paramSweepSeed = async () => {
    setIsRunning(true);

    try {
      const zip = new JSZip();

      const seeds = range(steps).map((i) => i);

      for (let i = 0; i < seeds.length; i++) {
        setStep(i);
        const seed = seeds[i] + 1;
        infomapStore.setSeed(seed);

        await infomapStore.run();

        if (mapStore.renderType === 'bioregions') {
          mapStore.render();
        }

        const filename = `${seed}.json`;
        zip.file(filename, JSON.stringify(infomapStore.tree)!);
      }

      const zipFile = await zip.generateAsync({ type: 'blob' });
      saveAs(zipFile, 'sweep seeds.zip');
    } catch (err) {
      console.error('Error in parameter sweep:', err);
    }

    setIsRunning(false);
  };

  const runMultilayerInfomap = async () => {
    if (infomapStore.isRunning) {
      infomapStore.abort();
      return;
    }

    await infomapStore.runMultilayer();

    if (mapStore.renderType === 'bioregions') {
      mapStore.render();
    }
  };

  const formatCodelength = format('.4f');
  const format2r = format('.2r');
  const formatPercent = (value: number) => `${format2r(value * 100)}%`;

  const weightFromAncestralNodes = !infomapStore.network
    ? '-'
    : `${(
        (100 * infomapStore.network.sumInternalTaxonLinkWeight) /
        (infomapStore.network.sumInternalTaxonLinkWeight +
          infomapStore.network.sumLeafTaxonLinkWeight)
      ).toPrecision(2)}%`;

  return (
    <VStack align="stretch" spacing={2}>
      <FormControl display="flex" w="100%" alignItems="center">
        <FormLabel htmlFor="showAdvanced" mb="0">
          Show
        </FormLabel>
        <Spacer />
        <Switch
          id="showAdvanced"
          mr={1}
          isChecked={show}
          onChange={() => setShow(!show)}
        />
      </FormControl>

      <Collapse in={show} animateOpacity style={{ width: '100%' }}>
        <VStack align="stretch" spacing={2}>
          <Button onClick={() => setIsInfomapOutputOpen(true)}>
            Infomap console
          </Button>
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
          <VStack>
            <Stat label="Levels">{infomapStore.numLevels}</Stat>
            <Stat label="Codelength">
              {formatCodelength(infomapStore.codelength)} bits
            </Stat>
            <Stat label="Codelength savings">
              {formatPercent(infomapStore.relativeCodelengthSavings)}
            </Stat>
            <Stat label="Ancestral network weight">
              {weightFromAncestralNodes}
            </Stat>
          </VStack>

          <Flex
            w="100%"
            mt={4}
            gap={2}
            alignItems="center"
            style={{ display: 'flex' }}
          >
            <Box minW={110}>Diversity order</Box>
            <Slider
              mx={1}
              focusThumbOnChange={false}
              value={infomapStore.diversityOrder}
              onChange={(value) => infomapStore.setDiversityOrder(value)}
              onChangeEnd={(value) =>
                infomapStore.setDiversityOrder(value, true)
              }
              min={0}
              max={3}
              step={0.1}
            >
              <SliderTrack>
                <SliderFilledTrack />
              </SliderTrack>
              <SliderThumb fontSize="sm" boxSize="16px" />
            </Slider>
            <Tag size="sm" minW={50}>
              {infomapStore.diversityOrder}
            </Tag>
          </Flex>

          <Flex
            w="100%"
            mt={4}
            gap={2}
            alignItems="center"
            style={{ display: 'flex' }}
          >
            <Box minW={110}>Rarity strength</Box>
            <Slider
              mx={1}
              focusThumbOnChange={false}
              value={infomapStore.spatialNormalizationOrderForTree}
              onChange={(value) =>
                infomapStore.setSpatialNormalizationOrderForTree(value)
              }
              onChangeEnd={(value) =>
                infomapStore.setSpatialNormalizationOrderForTree(value, true)
              }
              min={0}
              max={3}
              step={0.1}
            >
              <SliderTrack>
                <SliderFilledTrack />
              </SliderTrack>
              <SliderThumb fontSize="sm" boxSize="16px" />
            </Slider>
            <Tag size="sm" minW={50}>
              {infomapStore.spatialNormalizationOrderForTree}
            </Tag>
          </Flex>

          <Flex w="100%" mt={4} gap={2} alignItems="center">
            <Box minW={110}>Link threshold</Box>
            <Slider
              mx={1}
              focusThumbOnChange={false}
              value={infomapStore.linkWeightThresholdExponent}
              onChange={(value) =>
                infomapStore.setLinkWeightThresholdExponent(value)
              }
              onChangeEnd={(value) =>
                infomapStore.setLinkWeightThresholdExponent(value, true)
              }
              min={-9}
              max={-0.1}
              step={0.1}
            >
              <SliderTrack>
                <SliderFilledTrack />
              </SliderTrack>
              <SliderThumb fontSize="sm" boxSize="16px" />
            </Slider>
            <Tag size="sm" minW={50}>
              {format('.0e')(
                Math.pow(10, infomapStore.linkWeightThresholdExponent),
              )}
            </Tag>
          </Flex>

          <FormControl display="flex" w="100%" alignItems="center">
            <FormLabel htmlFor="alwaysUseStateNetwork" mb="0">
              Always use state network
            </FormLabel>
            <Spacer />
            <Switch
              id="alwaysUseStateNetwork"
              mr={1}
              isChecked={infomapStore.alwaysUseStateNetwork}
              onChange={() =>
                infomapStore.setAlwaysUseStateNetwork(
                  !infomapStore.alwaysUseStateNetwork,
                )
              }
            />
          </FormControl>

          <FormControl display="flex" w="100%" alignItems="center">
            <FormLabel htmlFor="patchSparseCells" mb="0">
              Patch sparse cells
            </FormLabel>
            <Spacer />
            <Switch
              id="patchSparseCells"
              mr={1}
              isChecked={speciesStore.binner.patchSparseCells}
              onChange={() => {
                speciesStore.binner.setPatchSparseCells(
                  !speciesStore.binner.patchSparseCells,
                );
                if (mapStore.renderType === 'bioregions') {
                  mapStore.setRenderType('heatmap');
                }
                infomapStore.rootStore.clearBioregions();
                infomapStore.updateNetwork();
                mapStore.render();
              }}
            />
          </FormControl>

          <FormControl display="flex" w="100%" alignItems="center">
            <FormLabel htmlFor="skipAdjustBipartiteFlow" mb="0">
              Flow projection
            </FormLabel>
            <Spacer />
            <Switch
              id="skipAdjustBipartiteFlow"
              mr={1}
              isChecked={!infomapStore.args.skipAdjustBipartiteFlow}
              onChange={() =>
                infomapStore.setSkipAdjustBipartiteFlow(
                  !infomapStore.args.skipAdjustBipartiteFlow,
                )
              }
            />
          </FormControl>

          <FormControl display="flex" w="100%" alignItems="center">
            <FormLabel htmlFor="twoLevel" mb="0">
              No nested bioregions
            </FormLabel>
            <Spacer />
            <Switch
              id="twoLevel"
              mr={1}
              isChecked={infomapStore.args.twoLevel}
              onChange={() => {
                infomapStore.setTwoLevel(!infomapStore.args.twoLevel);
              }}
            />
          </FormControl>

          <FormControl display="flex" w="100%" alignItems="center">
            <FormLabel htmlFor="entropyCorrected" mb="0">
              Entropy correction
            </FormLabel>
            <Spacer />
            <Switch
              id="entropyCorrected"
              mr={1}
              isChecked={infomapStore.args.entropyCorrected}
              onChange={() =>
                infomapStore.setEntropyCorrected(
                  !infomapStore.args.entropyCorrected,
                )
              }
            />
          </FormControl>

          <Flex
            w="100%"
            mt={4}
            gap={2}
            alignItems="center"
            style={{ display: 'flex' }}
          >
            <Box minW="110px">Markov time</Box>
            <Slider
              mx={1}
              focusThumbOnChange={false}
              value={infomapStore.args.markovTime}
              onChange={(value) => infomapStore.setMarkovTime(value)}
              onChangeEnd={(value) => infomapStore.setMarkovTime(value)}
              min={0}
              max={3}
              step={0.01}
            >
              <SliderTrack>
                <SliderFilledTrack />
              </SliderTrack>
              <SliderThumb fontSize="sm" boxSize="16px" />
            </Slider>
            <Tag size="sm" minW={50}>
              {infomapStore.args.markovTime}
            </Tag>
          </Flex>

          <FormControl display="flex" w="100%" alignItems="center">
            <FormLabel htmlFor="variableMarkovTime" mb="0">
              Variable Markov time
            </FormLabel>
            <Spacer />
            <Switch
              id="variableMarkovTime"
              mr={1}
              isChecked={infomapStore.args.variableMarkovTime}
              onChange={() =>
                infomapStore.setVariableMarkovTime(
                  !infomapStore.args.variableMarkovTime,
                )
              }
            />
          </FormControl>

          <Collapse
            in={infomapStore.args.variableMarkovTime}
            animateOpacity
            style={{ width: '100%', marginTop: 0 }}
          >
            <Flex w="100%" pl="10px" py={2}>
              <Box minW="100px" fontSize="0.9rem">
                Damping
              </Box>
              <Slider
                mx={3}
                isDisabled={!infomapStore.args.variableMarkovTime}
                focusThumbOnChange={false}
                value={infomapStore.args.variableMarkovDamping}
                onChange={(value) =>
                  infomapStore.setVariableMarkovDamping(value)
                }
                min={0}
                max={3}
                step={0.1}
              >
                <SliderTrack>
                  <SliderFilledTrack />
                </SliderTrack>
                <SliderThumb fontSize="sm" boxSize="16px" />
              </Slider>
              <Tag size="sm" minW={50}>
                {infomapStore.args.variableMarkovDamping}
              </Tag>
            </Flex>
          </Collapse>

          <FormControl display="flex" w="100%" alignItems="center">
            <FormLabel htmlFor="regularized" mb="0">
              Regularized
            </FormLabel>
            <Spacer />
            <Switch
              id="regularized"
              mr={1}
              isChecked={infomapStore.args.regularized}
              onChange={() =>
                infomapStore.setRegularized(!infomapStore.args.regularized)
              }
            />
          </FormControl>
          <Collapse
            in={infomapStore.args.regularized}
            animateOpacity
            style={{ width: '100%', marginTop: 0 }}
          >
            <Flex w="100%" pl="10px" py={2}>
              <Box minW="100px" fontSize="0.9rem">
                Strength
              </Box>
              <Slider
                mx={3}
                isDisabled={!infomapStore.args.regularized}
                focusThumbOnChange={false}
                value={infomapStore.args.regularizationStrength}
                onChange={(value) =>
                  infomapStore.setRegularizationStrength(value)
                }
                min={0}
                max={5}
                step={0.1}
              >
                <SliderTrack>
                  <SliderFilledTrack />
                </SliderTrack>
                <SliderThumb fontSize="sm" boxSize="16px" />
              </Slider>
              <Tag size="sm" minW={50}>
                {infomapStore.args.regularizationStrength}
              </Tag>
            </Flex>
          </Collapse>

          <FormControl
            display="flex"
            w="100%"
            alignItems="center"
            isDisabled={infomapStore.isRunning}
          >
            <FormLabel mb="0">Seed</FormLabel>
            <Spacer />
            <NumberInput
              maxW="70px"
              min={2}
              size="xs"
              value={infomapStore.args.seed}
              onChange={(value) => infomapStore.setSeed(+value)}
            >
              <NumberInputField />
              <NumberInputStepper>
                <NumberIncrementStepper />
                <NumberDecrementStepper />
              </NumberInputStepper>
            </NumberInput>
          </FormControl>

          <FormControl display="flex" w="100%" alignItems="center">
            <FormLabel htmlFor="render-data-on-zoom" mb="0">
              Render data while zooming
            </FormLabel>
            <Spacer />
            <Switch
              id="render-data-on-zoom"
              mr={1}
              isChecked={mapStore.renderDataWhileZooming}
              onChange={() =>
                mapStore.setRenderDataWhileZooming(
                  !mapStore.renderDataWhileZooming,
                )
              }
            />
          </FormControl>

          <FormControl display="flex" w="100%" alignItems="center">
            <FormLabel mb="0">
              <Button size="sm" w="100%" onClick={() => mapStore.render}>
                Force render
              </Button>
            </FormLabel>
          </FormControl>

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
                //isLoading={infomapStore.isRunning}
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

          <FormControl
            display="flex"
            w="100%"
            alignItems="center"
            isDisabled={infomapStore.isRunning}
          >
            <FormLabel mb="0">Parameter sweep</FormLabel>
            <Spacer />
            <NumberInput
              maxW="70px"
              min={2}
              size="xs"
              value={steps}
              onChange={(value) => setSteps(+value)}
            >
              <NumberInputField />
              <NumberInputStepper>
                <NumberIncrementStepper />
                <NumberDecrementStepper />
              </NumberInputStepper>
            </NumberInput>
          </FormControl>
          <VStack>
            <Button
              size="sm"
              isDisabled={
                !speciesStore.loaded ||
                !treeStore.isLoaded ||
                infomapStore.isRunning
              }
              isLoading={isRunning}
              onClick={paramSweepIntegrationTime}
            >
              Integration time
            </Button>
            <Button
              size="sm"
              isDisabled={
                !speciesStore.loaded ||
                !treeStore.isLoaded ||
                infomapStore.isRunning
              }
              isLoading={isRunning}
              onClick={paramSweepNumIterations}
            >
              Num trials
            </Button>
            <Button
              size="sm"
              isDisabled={
                !speciesStore.loaded ||
                !treeStore.isLoaded ||
                infomapStore.isRunning
              }
              isLoading={isRunning}
              onClick={paramSweepSeed}
            >
              Seeds
            </Button>
          </VStack>
          {isRunning && (
            <Progress
              value={step}
              max={steps}
              size="xs"
              w="100%"
              color="blue.500"
            />
          )}
        </VStack>
      </Collapse>
    </VStack>
  );
});
