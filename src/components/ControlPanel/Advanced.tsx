import { useState } from 'react';
import { observer } from 'mobx-react';
import {
  Button,
  VStack,
  Progress,
  Spacer,
  NumberInput,
  Flex,
  Box,
  Tag,
  Field,
  Collapsible,
} from '@chakra-ui/react';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { useStore } from '../../store';
import { range, format } from 'd3';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import Stat from '../Stat';
import Modal from './Modal';
import { saveCanvas } from '../../utils/exporter';
import { rangeArray } from '../../utils/range';
import IntervalSlider from './IntervalSlider';
import {
  NumberInputField,
  NumberInputRoot,
} from '@/components/ui/number-input';

export default observer(function Advanced() {
  const [isRunning, setIsRunning] = useState(false);
  const [steps, setSteps] = useState(5);
  const [step, setStep] = useState(0);
  const [isInfomapOutputOpen, setIsInfomapOutputOpen] = useState(false);
  const [show, setShow] = useState(process.env.NODE_ENV === 'development');
  const { speciesStore, treeStore, infomapStore, mapStore } = useStore();

  const [markovTimeStart, setMarkovTimeStart] = useState(0.8);
  const [markovTimeStop, setMarkovTimeStop] = useState(1.2);

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

  const paramSweepMarkovTime = async () => {
    setIsRunning(true);

    try {
      const zip = new JSZip();

      const deltaMarkovTime = (markovTimeStop - markovTimeStart) / (steps - 1);
      const markovTimes = range(steps).map(
        (i) => markovTimeStart + i * deltaMarkovTime,
      );

      for (let i = 0; i < markovTimes.length; i++) {
        setStep(i);
        const markovTime = markovTimes[i];
        infomapStore.setMarkovTime(markovTime);

        await infomapStore.run();

        if (mapStore.renderType === 'bioregions') {
          mapStore.render();
        }

        const filename = `Markov-time-${markovTime}.json`;
        zip.file(filename, JSON.stringify(infomapStore.tree)!);
      }

      const zipFile = await zip.generateAsync({ type: 'blob' });
      saveAs(zipFile, 'sweep num trials.zip');
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
    <VStack align="stretch" gap={2}>
      <Field.Root display="flex" flexDir="row" w="100%" alignItems="center">
        <Field.Label htmlFor="showAdvanced" mb="0">
          Show
        </Field.Label>
        <Spacer />
        <Switch
          id="showAdvanced"
          mr={1}
          checked={show}
          onCheckedChange={() => setShow(!show)}
        />
      </Field.Root>

      <Collapsible.Root open={show} style={{ width: '100%' }}>
        <Collapsible.Content>
          <VStack align="stretch" gap={2}>
            <Button onClick={() => setIsInfomapOutputOpen(true)}>
              Infomap console
            </Button>
            <Modal
              header="Infomap output"
              open={isInfomapOutputOpen}
              onOpenChange={(e) => setIsInfomapOutputOpen(e.open)}
              scrollBehavior="inside"
              size="xl"
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
            {!infomapStore.useWholeTree && (
              <Field.Root
                display="flex"
                flexDir="row"
                w="100%"
                alignItems="center"
              >
                <Field.Label
                  htmlFor="useWeightedTreeNodeLinksIfTimeSlice"
                  mb="0"
                >
                  Weight ancestral nodes on rarity
                </Field.Label>
                <Spacer />
                <Switch
                  id="useWeightedTreeNodeLinksIfTimeSlice"
                  mr={1}
                  checked={infomapStore.useWeightedTreeNodeLinksIfTimeSlice}
                  onCheckedChange={() =>
                    infomapStore.setUseWeightedTreeNodeLinksIfTimeSlice(
                      !infomapStore.useWeightedTreeNodeLinksIfTimeSlice,
                    )
                  }
                />
              </Field.Root>
            )}
            <Field.Root
              display="flex"
              flexDir="row"
              w="100%"
              alignItems="center"
            >
              <Field.Label htmlFor="useWeightedSpecies" mb="0">
                Weight species by range
              </Field.Label>
              <Spacer />
              <Switch
                id="useWeightedSpecies"
                mr={1}
                checked={infomapStore.useWeightedSpeciesLinks}
                onCheckedChange={() =>
                  infomapStore.setUseWeightedSpeciesLinks(
                    !infomapStore.useWeightedSpeciesLinks,
                  )
                }
              />
            </Field.Root>
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
                w="100%"
                // focusThumbOnChange={false}
                value={[infomapStore.spatialNormalizationOrder]}
                onValueChange={(e) =>
                  infomapStore.setSpatialNormalizationOrder(e.value[0])
                }
                onValueChangeEnd={(e) =>
                  infomapStore.setSpatialNormalizationOrder(e.value[0], true)
                }
                min={0}
                max={3}
                step={0.1}
              />
              <Tag.Root size="sm" minW={50}>
                <Tag.Label>{infomapStore.spatialNormalizationOrder}</Tag.Label>
              </Tag.Root>
            </Flex>
            <Flex w="100%" mt={4} gap={2} alignItems="center">
              <Box minW={110}>Link threshold</Box>
              <Slider
                mx={1}
                w="100%"
                // focusThumbOnChange={false}
                value={[infomapStore.linkWeightThresholdExponent]}
                onValueChange={(e) =>
                  infomapStore.setLinkWeightThresholdExponent(e.value[0])
                }
                onValueChangeEnd={(e) =>
                  infomapStore.setLinkWeightThresholdExponent(e.value[0], true)
                }
                min={-9}
                max={-0.1}
                step={0.1}
              />
              <Tag.Root size="sm" minW={50}>
                <Tag.Label>
                  {format('.0e')(
                    Math.pow(10, infomapStore.linkWeightThresholdExponent),
                  )}
                </Tag.Label>
              </Tag.Root>
            </Flex>
            <Field.Root
              display="flex"
              flexDir="row"
              w="100%"
              alignItems="center"
            >
              <Field.Label htmlFor="alwaysUseStateNetwork" mb="0">
                Always use state network
              </Field.Label>
              <Spacer />
              <Switch
                id="alwaysUseStateNetwork"
                mr={1}
                checked={infomapStore.alwaysUseStateNetwork}
                onCheckedChange={() =>
                  infomapStore.setAlwaysUseStateNetwork(
                    !infomapStore.alwaysUseStateNetwork,
                  )
                }
              />
            </Field.Root>
            <Field.Root
              display="flex"
              flexDir="row"
              w="100%"
              alignItems="center"
            >
              <Field.Label htmlFor="patchSparseCells" mb="0">
                Patch sparse cells
              </Field.Label>
              <Spacer />
              <Switch
                id="patchSparseCells"
                mr={1}
                checked={speciesStore.binner.patchSparseCells}
                onCheckedChange={() => {
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
            </Field.Root>
            <Field.Root
              display="flex"
              flexDir="row"
              w="100%"
              alignItems="center"
            >
              <Field.Label htmlFor="skipAdjustBipartiteFlow" mb="0">
                Flow projection
              </Field.Label>
              <Spacer />
              <Switch
                id="skipAdjustBipartiteFlow"
                mr={1}
                checked={!infomapStore.args.skipAdjustBipartiteFlow}
                onCheckedChange={() =>
                  infomapStore.setSkipAdjustBipartiteFlow(
                    !infomapStore.args.skipAdjustBipartiteFlow,
                  )
                }
              />
            </Field.Root>
            <Field.Root
              display="flex"
              flexDir="row"
              w="100%"
              alignItems="center"
            >
              <Field.Label htmlFor="twoLevel" mb="0">
                No nested bioregions
              </Field.Label>
              <Spacer />
              <Switch
                id="twoLevel"
                mr={1}
                checked={infomapStore.args.twoLevel}
                onCheckedChange={() => {
                  infomapStore.setTwoLevel(!infomapStore.args.twoLevel);
                }}
              />
            </Field.Root>
            <Field.Root
              display="flex"
              flexDir="row"
              w="100%"
              alignItems="center"
            >
              <Field.Label htmlFor="entropyCorrected" mb="0">
                Entropy correction
              </Field.Label>
              <Spacer />
              <Switch
                id="entropyCorrected"
                mr={1}
                checked={infomapStore.args.entropyCorrected}
                onCheckedChange={() =>
                  infomapStore.setEntropyCorrected(
                    !infomapStore.args.entropyCorrected,
                  )
                }
              />
            </Field.Root>
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
                w="100%"
                // focusThumbOnChange={false}
                value={[infomapStore.args.markovTime ?? 1]}
                onValueChange={(e) => infomapStore.setMarkovTime(e.value[0])}
                onValueChangeEnd={(e) => infomapStore.setMarkovTime(e.value[0])}
                min={0}
                max={3}
                step={0.01}
              />
              <Tag.Root size="sm" minW={50}>
                <Tag.Label>{infomapStore.args.markovTime}</Tag.Label>
              </Tag.Root>
            </Flex>
            <Field.Root
              display="flex"
              flexDir="row"
              w="100%"
              alignItems="center"
            >
              <Field.Label htmlFor="variableMarkovTime" mb="0">
                Variable Markov time
              </Field.Label>
              <Spacer />
              <Switch
                id="variableMarkovTime"
                mr={1}
                checked={infomapStore.args.variableMarkovTime}
                onCheckedChange={() =>
                  infomapStore.setVariableMarkovTime(
                    !infomapStore.args.variableMarkovTime,
                  )
                }
              />
            </Field.Root>
            <Collapsible.Root
              open={infomapStore.args.variableMarkovTime}
              style={{ width: '100%', marginTop: 0 }}
            >
              <Collapsible.Content>
                <Flex w="100%" pl="10px" py={2}>
                  <Box minW="100px" fontSize="0.9rem">
                    Damping
                  </Box>
                  <Slider
                    mx={3}
                    disabled={!infomapStore.args.variableMarkovTime}
                    // focusThumbOnChange={false}
                    value={[infomapStore.args.variableMarkovDamping ?? 1]}
                    onValueChange={(e) =>
                      infomapStore.setVariableMarkovDamping(e.value[0])
                    }
                    min={0}
                    max={3}
                    step={0.1}
                  />
                  <Tag.Root size="sm" minW={50}>
                    <Tag.Label>
                      {infomapStore.args.variableMarkovDamping}
                    </Tag.Label>
                  </Tag.Root>
                </Flex>
              </Collapsible.Content>
            </Collapsible.Root>
            <Field.Root
              display="flex"
              flexDir="row"
              w="100%"
              alignItems="center"
            >
              <Field.Label htmlFor="regularized" mb="0">
                Regularized
              </Field.Label>
              <Spacer />
              <Switch
                id="regularized"
                mr={1}
                checked={infomapStore.args.regularized}
                onCheckedChange={() =>
                  infomapStore.setRegularized(!infomapStore.args.regularized)
                }
              />
            </Field.Root>
            <Collapsible.Root
              open={infomapStore.args.regularized}
              style={{ width: '100%', marginTop: 0 }}
            >
              <Collapsible.Content>
                <Flex w="100%" pl="10px" py={2}>
                  <Box minW="100px" fontSize="0.9rem">
                    Strength
                  </Box>
                  <Slider
                    mx={3}
                    disabled={!infomapStore.args.regularized}
                    // focusThumbOnChange={false}
                    value={[infomapStore.args.regularizationStrength ?? 1]}
                    onValueChange={(e) =>
                      infomapStore.setRegularizationStrength(e.value[0])
                    }
                    min={0}
                    max={5}
                    step={0.1}
                  />
                  <Tag.Root size="sm" minW={50}>
                    <Tag.Label>
                      {infomapStore.args.regularizationStrength}
                    </Tag.Label>
                  </Tag.Root>
                </Flex>
              </Collapsible.Content>
            </Collapsible.Root>
            <Field.Root
              display="flex"
              flexDir="row"
              w="100%"
              alignItems="center"
              disabled={infomapStore.isRunning}
            >
              <Field.Label mb="0">Seed</Field.Label>
              <Spacer />
              <NumberInputRoot
                maxW="70px"
                min={2}
                size="xs"
                value={`${infomapStore.args.seed}`}
                onValueChange={(e) => infomapStore.setSeed(+e.value)}
              >
                <NumberInputField />
              </NumberInputRoot>
            </Field.Root>
            <Field.Root
              display="flex"
              flexDir="row"
              w="100%"
              alignItems="center"
            >
              <Field.Label htmlFor="render-data-on-zoom" mb="0">
                Render data while zooming
              </Field.Label>
              <Spacer />
              <Switch
                id="render-data-on-zoom"
                mr={1}
                checked={mapStore.renderDataWhileZooming}
                onCheckedChange={() =>
                  mapStore.setRenderDataWhileZooming(
                    !mapStore.renderDataWhileZooming,
                  )
                }
              />
            </Field.Root>
            <Field.Root
              display="flex"
              flexDir="row"
              w="100%"
              alignItems="center"
            >
              <Field.Label mb="0">
                <Button size="sm" w="100%" onClick={() => mapStore.render}>
                  Force render
                </Button>
              </Field.Label>
            </Field.Root>
            <Field.Root
              display="flex"
              flexDir="row"
              w="100%"
              alignItems="center"
              disabled={infomapStore.isRunning}
            >
              <Field.Label mb="0">
                <Button
                  size="sm"
                  w="100%"
                  colorScheme={infomapStore.isRunning ? 'red' : 'gray'}
                  variant={infomapStore.isRunning ? 'outline' : 'solid'}
                  onClick={runMultilayerInfomap}
                  //loading={infomapStore.isRunning}
                  disabled={!infomapStore.network}
                >
                  {!infomapStore.isRunning ? 'Run multilayer' : 'Abort'}
                </Button>
              </Field.Label>
              <Spacer />
              <NumberInputRoot
                maxW="70px"
                min={2}
                size="xs"
                value={`${infomapStore.numLayers}`}
                onValueChange={(e) => infomapStore.setNumLayers(+e.value)}
              >
                <NumberInputField />
              </NumberInputRoot>
            </Field.Root>
            <Field.Root
              display="flex"
              flexDir="row"
              w="100%"
              alignItems="center"
              disabled={infomapStore.isRunning}
            >
              <Field.Label mb="0">Parameter sweep</Field.Label>
              <Spacer />
              <NumberInputRoot
                maxW="70px"
                min={2}
                size="xs"
                value={`${steps}`}
                onValueChange={(e) => setSteps(+e.value)}
              >
                <NumberInputField />
              </NumberInputRoot>
            </Field.Root>
            <VStack alignItems="flex-start">
              <Button
                size="sm"
                disabled={
                  !speciesStore.loaded ||
                  !treeStore.isLoaded ||
                  infomapStore.isRunning
                }
                loading={isRunning}
                onClick={paramSweepIntegrationTime}
              >
                Integration time
              </Button>
              <Button
                size="sm"
                disabled={
                  !speciesStore.loaded ||
                  !treeStore.isLoaded ||
                  infomapStore.isRunning
                }
                loading={isRunning}
                onClick={paramSweepNumIterations}
              >
                Num trials
              </Button>
              <Button
                size="sm"
                disabled={
                  !speciesStore.loaded ||
                  !treeStore.isLoaded ||
                  infomapStore.isRunning
                }
                loading={isRunning}
                onClick={paramSweepSeed}
              >
                Seeds
              </Button>
              <Box w="100%">
                <Box minW="110px">Markov time</Box>
                <Flex
                  w="100%"
                  mt={4}
                  gap={2}
                  alignItems="center"
                  style={{ display: 'flex' }}
                >
                  <IntervalSlider
                    values={rangeArray(0.5, 2, 0.01, { inclusive: true }).map(
                      (v) => Math.round(v * 100) / 100,
                    )}
                    value={[markovTimeStart, markovTimeStop]}
                    onChange={([start, stop]: [number, number]) => {
                      setMarkovTimeStart(start);
                      setMarkovTimeStop(stop);
                    }}
                  />
                  <Button
                    size="sm"
                    disabled={!speciesStore.loaded || infomapStore.isRunning}
                    loading={isRunning}
                    onClick={paramSweepMarkovTime}
                  >
                    Run
                  </Button>
                </Flex>
              </Box>
            </VStack>
            {isRunning && (
              <Progress.Root
                value={step}
                max={steps}
                size="xs"
                w="100%"
                color="blue.500"
              />
            )}
          </VStack>
        </Collapsible.Content>
      </Collapsible.Root>
    </VStack>
  );
});
