import { useState } from 'react';
import { observer } from "mobx-react";
import { Button, VStack, Progress } from '@chakra-ui/react';
import { useStore } from '../../store'
import { range, format } from 'd3';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export default observer(function () {
  const [isRunning, setIsRunning] = useState(false);
  const [step, setStep] = useState(0);
  const { speciesStore, treeStore, infomapStore } = useStore();

  const paramSweep = async () => {
    setIsRunning(true);

    treeStore.setIncludeTree();

    const zip = new JSZip();

    const steps = 10;
    const weights = range(steps).map(i => i / steps);
    const f = format('.1f');

    for (let i = 0; i < weights.length; i++) {
      setStep(i);
      const w = weights[i];

      treeStore.setWeightParameter(w);
      await infomapStore.run();

      const filename = `${speciesStore.name}_weight_${f(w)}.tree`;
      zip.file(filename, infomapStore.treeString!);
    }

    const zipFile = await zip.generateAsync({ type: "blob" });
    saveAs(zipFile, 'sweep.zip');

    setIsRunning(false);
  }

  return (
    <VStack align="stretch">
      <Button isDisabled={!speciesStore.loaded || !treeStore.loaded} isLoading={isRunning} onClick={paramSweep}>Run parameter sweep</Button>
      {isRunning && <Progress
        value={step}
        max={10}
        size="xs"
        w="100%"
        color="blue.500"
      />}
    </VStack>
  );
});