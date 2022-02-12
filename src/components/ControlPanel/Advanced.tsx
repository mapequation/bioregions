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
  Text,
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

  const paramSweep = async () => {
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

        // const filename = `${speciesStore.name}_integration_time_${f(t)}.tree`;
        const filename = `Integration time ${f(1 - t)}.json`;
        // zip.file(filename, infomapStore.treeString!);
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
  const formatPercent = format('.1%');

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
            <Box maxW="50%">
              <Text fontSize="0.8rem">
                <pre>
                  {infomapStore.infomapOutput ||
                    'Load data and run Infomap to see output here'}
                </pre>
              </Text>
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
            <FormLabel htmlFor="steps" mb="0">
              <Button
                size="sm"
                isDisabled={
                  !speciesStore.loaded ||
                  !treeStore.loaded ||
                  infomapStore.isRunning
                }
                isLoading={isRunning}
                onClick={paramSweep}
              >
                Run parameter sweep
              </Button>
            </FormLabel>
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
