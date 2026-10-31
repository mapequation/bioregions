import { Box, Grid, Stack, Text } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { useMemo } from 'react';
import { useStore } from '../../../store';
import { exampleCatalog } from '../../../store/data/catalog';
import ExampleCard from './ExampleCard';

/** Examples tab (§5.3): every catalog example, bundled datasets first, in one card grid. */
export default observer(function ExamplesTab() {
  const { dataStore } = useStore();
  const catalog = useMemo(() => exampleCatalog(), []);
  return (
    <Stack as="section" aria-labelledby="examples-heading" gap={4} p={{ base: 4, md: 6 }} maxW="6xl" mx="auto">
      <Box>
        <Text as="h3" id="examples-heading" fontSize="md" fontWeight="semibold">
          Examples
        </Text>
        <Text fontSize="sm" color="fg.muted">
          Bundled datasets download from this site and load in your browser. Query examples stream live from GBIF or
          OBIS through the Search tab. Loading an example replaces the occurrences loaded now.
        </Text>
      </Box>
      {dataStore.isLoading && (
        <Text role="status" fontSize="sm" color="fg.muted">
          A load is running. Load is available again when it finishes or when you stop it.
        </Text>
      )}
      <Grid templateColumns="repeat(auto-fill, minmax(min(100%, 260px), 1fr))" gap={3}>
        {catalog.map((entry) => (
          <ExampleCard key={entry.id} entry={entry} />
        ))}
      </Grid>
    </Stack>
  );
});
