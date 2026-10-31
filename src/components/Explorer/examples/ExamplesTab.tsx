import { Stack, Text } from '@chakra-ui/react';
import { observer } from 'mobx-react';

/** Examples tab (placeholder): the example catalog moves here from the Data panel. */
export default observer(function ExamplesTab() {
  return (
    <Stack maxW="2xl" mx="auto" p={6} gap={2}>
      <Text fontWeight="medium">Examples</Text>
      <Text color="fg.muted">Examples are not listed here yet. Use Load examples in the Data panel.</Text>
    </Stack>
  );
});
