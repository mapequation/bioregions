import { Button, VStack } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { useStore } from '../../store';
import type RootStore from '../../store/RootStore';
import { saveCanvas, saveString } from '../../utils/exporter';

interface ExportProps {
  rootStore?: RootStore;
}

export default observer(function Export({ rootStore }: ExportProps) {
  const _rootStore = useStore();
  const { infomapStore, mapStore } = rootStore ?? _rootStore;
  const { parameterName } = infomapStore;

  const downloadMap = () => {
    saveCanvas(mapStore.canvas!, `${parameterName}.png`);
  };

  const downloadInfomapTree = () => {
    if (!infomapStore.treeString) return;

    const filename = `${parameterName}.tree`;
    saveString(filename, infomapStore.treeString);
  };

  const downloadInfomapOutput = () => {
    if (!infomapStore.tree) return;

    const suffix = infomapStore.haveStateNodes ? '_states' : '';
    const filename = `${parameterName}${suffix}.json`;
    saveString(filename, JSON.stringify(infomapStore.tree));
  };

  const downloadNetwork = () => {
    if (!infomapStore.network) return;

    const _states = infomapStore.haveStateNetwork ? `_states` : '';
    const filename = `${parameterName}${_states}.net`;
    saveString(filename, infomapStore.serializeNetwork() ?? '');
  };

  const downloadMultilayerNetwork = () => {
    if (!infomapStore.multilayerNetwork) return;

    const filename = `${parameterName}_intra.net`;
    saveString(filename, infomapStore.serializeMultilayerNetwork() ?? '');
  };

  return (
    <VStack align="stretch">
      <Button size="sm" onClick={downloadMap}>
        Download map
      </Button>
      <Button
        size="sm"
        isDisabled={!infomapStore.treeString}
        onClick={downloadInfomapTree}
      >
        Download Infomap tree
      </Button>
      <Button
        size="sm"
        isDisabled={!infomapStore.tree}
        onClick={downloadInfomapOutput}
      >
        Download Infomap output
      </Button>
      <Button
        size="sm"
        isDisabled={!infomapStore.network}
        onClick={downloadNetwork}
      >
        Download network
      </Button>
      {infomapStore.multilayerNetwork && (
        <Button
          size="sm"
          isDisabled={!infomapStore.multilayerNetwork}
          onClick={downloadMultilayerNetwork}
        >
          Download multilayer network
        </Button>
      )}
    </VStack>
  );
});
