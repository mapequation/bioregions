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
} from '@chakra-ui/react';
import { useStore } from '../../store';
import { range, format } from 'd3';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import Stat from '../Stat';
import Modal from './Modal';

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
      const f = format('.2f');

      for (let i = 0; i < times.length; i++) {
        setStep(i);
        const t = times[i];
        infomapStore.setIntegrationTime(t);

        await infomapStore.run();

        if (mapStore.renderType === 'bioregions') {
          mapStore.render();
        }

        const filename = `it-${f(1 - t)}.json`;
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
      saveAs(zipFile, 'sweep.zip');
    } catch (err) {
      console.error('Error in parameter sweep:', err);
    }

    setIsRunning(false);
  };

  const formatCodelength = format('.4f');
  const format2r = format('.2r');
  const formatPercent = (value: number) => `${format2r(value * 100)}%`;

  const actualTreeWeightBalance = !infomapStore.network
    ? ''
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
            <Stat label="Actual tree weight">{actualTreeWeightBalance}</Stat>
          </VStack>

          <Flex
            w="100%"
            mt={4}
            gap={2}
            alignItems="center"
            style={{ display: 'flex' }}
          >
            <Box w="50%">Diversity order</Box>
            <Slider
              w="50%"
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
              <SliderThumb fontSize="sm" boxSize="32px">
                {infomapStore.diversityOrder}
              </SliderThumb>
            </Slider>
          </Flex>

          <FormControl display="flex" w="100%" alignItems="center">
            <FormLabel htmlFor="alwaysUseStateNetwork" mb="0">
              Always use state network
            </FormLabel>
            <Spacer />
            <Switch
              id="alwaysUseStateNetwork"
              isChecked={infomapStore.alwaysUseStateNetwork}
              onChange={() =>
                infomapStore.setAlwaysUseStateNetwork(
                  !infomapStore.alwaysUseStateNetwork,
                )
              }
            />
          </FormControl>

          <FormControl display="flex" w="100%" alignItems="center">
            <FormLabel htmlFor="skipAdjustBipartiteFlow" mb="0">
              Flow projection
            </FormLabel>
            <Spacer />
            <Switch
              id="skipAdjustBipartiteFlow"
              isChecked={!infomapStore.args.skipAdjustBipartiteFlow}
              onChange={() =>
                infomapStore.setSkipAdjustBipartiteFlow(
                  !infomapStore.args.skipAdjustBipartiteFlow,
                )
              }
            />
          </FormControl>
          <FormControl display="flex" w="100%" alignItems="center">
            <FormLabel htmlFor="entropyCorrected" mb="0">
              Entropy correction
            </FormLabel>
            <Spacer />
            <Switch
              id="entropyCorrected"
              isChecked={infomapStore.args.entropyCorrected}
              onChange={() =>
                infomapStore.setEntropyCorrected(
                  !infomapStore.args.entropyCorrected,
                )
              }
            />
          </FormControl>

          <FormControl display="flex" w="100%" alignItems="center">
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
                onChange={(value) =>
                  infomapStore.setRegularizationStrength(value)
                }
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

          <FormControl display="flex" w="100%" alignItems="center">
            <FormLabel htmlFor="render-data-on-zoom" mb="0">
              Render data while zooming
            </FormLabel>
            <Spacer />
            <Switch
              id="render-data-on-zoom"
              isChecked={mapStore.renderDataWhileZooming}
              onChange={() =>
                mapStore.setRenderDataWhileZooming(
                  !mapStore.renderDataWhileZooming,
                )
              }
            />
          </FormControl>
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
                !treeStore.loaded ||
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
                !treeStore.loaded ||
                infomapStore.isRunning
              }
              isLoading={isRunning}
              // onClick={paramSweepIntegrationTime}
              onClick={paramSweepNumIterations}
            >
              Num trials
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
