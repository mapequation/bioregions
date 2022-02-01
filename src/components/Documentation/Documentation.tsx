import { Box, Heading } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { useStore } from '../../store';
import Demo from '../Demo';

export default function Documentation() {
  return (
    <Box w="100%" id="documentation">
      <Heading as="h2">Algorithm</Heading>
      <Algorithm />
    </Box>
  );
}

const Algorithm = observer(() => {
  const { documentationStore } = useStore();
  if (!documentationStore) {
    return null;
  }
  const { tree } = documentationStore.demoStore.treeStore;
  if (!tree) {
    return null;
  }
  return <Demo tree={tree} />;
});
