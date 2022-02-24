import { Button, VStack } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { useStore } from '../../store';
import { saveString } from '../../utils/exporter';

export default observer(function Export() {
  const { infomapStore, speciesStore } = useStore();

  const downloadInfomapTree = () => {
    if (!infomapStore.treeString) return;

    const filename = `${speciesStore.name}.tree`;
    saveString(filename, infomapStore.treeString);
  };

  const downloadNetwork = () => {
    if (!infomapStore.network) return;

    const _states = infomapStore.haveStateNetwork ? `_states` : '';
    const filename = `${speciesStore.name}${_states}.net`;
    saveString(filename, infomapStore.serializeNetwork() ?? '');
  };

  return (
    <VStack align="stretch">
      <Button
        size="sm"
        isDisabled={!infomapStore.treeString}
        onClick={downloadInfomapTree}
      >
        Download Infomap tree
      </Button>
      <Button
        size="sm"
        isDisabled={!infomapStore.network}
        onClick={downloadNetwork}
      >
        Download network
      </Button>
    </VStack>
  );
});
