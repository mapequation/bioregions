import { Box, Flex, Grid, Text } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { useMemo } from 'react';
import { exampleCatalog } from '../../../store/data/catalog';
import ExampleCard from '../examples/ExampleCard';

/**
 * The catalog's query examples for the empty preview state, as the same cards as the
 * Examples tab: Load loads the example, Open in Search only fills in the query.
 */
export default observer(function ExampleCards() {
  const queries = useMemo(() => exampleCatalog().filter((e) => e.kind === 'query'), []);
  return (
    <Box as="section" aria-labelledby="example-cards-heading">
      <Flex align="baseline" gap={2} wrap="wrap" mb={2.5}>
        <Text as="h3" id="example-cards-heading" fontSize="sm" fontWeight="semibold">
          Or start from an example
        </Text>
        <Text fontSize="xs" color="fg.muted">
          Open in Search fills in the query without loading; Load also loads it.
        </Text>
      </Flex>
      <Grid templateColumns="repeat(auto-fill, minmax(min(100%, 240px), 1fr))" gap={3}>
        {queries.map((entry) => (
          <ExampleCard key={entry.id} entry={entry} />
        ))}
      </Grid>
    </Box>
  );
});
