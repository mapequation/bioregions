import { Button, VStack } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { useStore } from '../../store';
import { saveString } from '../../utils/exporter';

export default observer(function Export() {
  const { infomapStore, speciesStore } = useStore();

  const downloadTree = () => {
    if (!infomapStore.treeString) return;

    const filename = `${speciesStore.name}.tree`;
    saveString(filename, infomapStore.treeString);
  };

  return (
    <VStack align="stretch">
      <Button
        size="sm"
        isDisabled={infomapStore.isRunning || !infomapStore.treeString}
        onClick={downloadTree}
      >
        Download Tree
      </Button>
    </VStack>
  );
});