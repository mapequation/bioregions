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
} from '@chakra-ui/react';
import { useStore } from '../../store';
import { range, format } from 'd3';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export default observer(function Advanced() {
  const [isRunning, setIsRunning] = useState(false);
  const [steps, setSteps] = useState(5);
  const [step, setStep] = useState(0);
  const { speciesStore, treeStore, infomapStore, mapStore } = useStore();

  const paramSweep = async () => {
    setIsRunning(true);

    try {
      const zip = new JSZip();

      treeStore.setIncludeTree(false);

      await infomapStore.run();
      zip.file(
        `${speciesStore.name}_without_tree.tree`,
        infomapStore.treeString!,
      );

      treeStore.setIncludeTree();

      const weights = range(steps).map((i) => i / (steps - 1));
      const f = format('.1f');

      for (let i = 0; i < weights.length; i++) {
        setStep(i);
        const w = weights[i];

        treeStore.setWeightParameter(w);
        await infomapStore.run();

        // if (!finished) {
        //   setIsRunning(false);
        //   setStep(0);
        //   return;
        // }

        if (mapStore.renderType === 'bioregions') {
          mapStore.render();
        }

        const filename = `${speciesStore.name}_weight_${f(w)}.tree`;
        zip.file(filename, infomapStore.treeString!);
      }

      const zipFile = await zip.generateAsync({ type: 'blob' });
      saveAs(zipFile, 'sweep.zip');
      setIsRunning(false);
    } catch (err) {
      console.error('Error in parameter sweep:', err);
      setIsRunning(false);
    }
  };

  return (
    <VStack align="stretch">
      <FormControl
        display="flex"
        w="100%"
        alignItems="center"
        isDisabled={infomapStore.isRunning}
      >
        <FormLabel htmlFor="steps" mb="0">
          Steps
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

      <Button
        size="sm"
        isDisabled={
          !speciesStore.loaded || !treeStore.loaded || infomapStore.isRunning
        }
        isLoading={isRunning}
        onClick={paramSweep}
      >
        Run parameter sweep
      </Button>
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
  );
});
