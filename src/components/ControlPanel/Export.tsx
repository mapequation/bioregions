import { Button, VStack } from '@chakra-ui/react'
import { useStore } from '../../store';
import { saveAs } from 'file-saver';

export default function Export() {
  const { infomapStore, speciesStore } = useStore();

  const downloadTree = () => {
    if (!infomapStore.treeString) return;

    const blob = new Blob([infomapStore.treeString], { type: 'text/plain;charset=utf-8' });
    saveAs(blob, `${speciesStore.name}.tree`);
  }

  return (
    <VStack align="stretch">
      <Button size="sm" isDisabled={!infomapStore.treeString} onClick={downloadTree}>Download Tree</Button>
    </VStack>
  );
}