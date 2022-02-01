import { Box, Heading } from '@chakra-ui/react';
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

function Algorithm() {
  const { documentationStore } = useStore();
  const { tree } = documentationStore;
  if (!tree) {
    return null;
  }
  return <Demo tree={tree} />;
}
