import { Stack, Text } from '@chakra-ui/react';
import { observer } from 'mobx-react';

/** Upload tab (placeholder): file upload moves here from the Data panel. */
export default observer(function UploadTab() {
  return (
    <Stack maxW="2xl" mx="auto" p={6} gap={2}>
      <Text fontWeight="medium">Upload</Text>
      <Text color="fg.muted">Uploading files from here is not available yet. Use Load data in the Data panel.</Text>
    </Stack>
  );
});
