import { Alert, Box, Button, Flex, Grid, Heading, Icon, Stack, Text } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { useCallback } from 'react';
import { LuArrowLeft, LuGitFork, LuNetwork, LuRotateCw } from 'react-icons/lu';
import { isQueryRunnable } from '@/sources';
import { useStore } from '../../../store';
import { fmtInt } from '../format';
import CladeCard from './CladeCard';
import NameMatchSummary from './NameMatchSummary';
import TreeSelectionSummary from './TreeSelectionSummary';
import TreeSourceTable from './TreeSourceTable';

/** Species count of the current query, from the load plans or the preview KPIs. */
function useQuerySpeciesCount(): number | null {
  const { explorerStore } = useStore();
  return explorerStore.speciesCounts?.length ?? explorerStore.kpis?.species ?? null;
}

/** Centred card for the states before any names are matched. */
function StartCard({ children }: { children: React.ReactNode }) {
  return (
    <Flex data-testid="phylo-tab" h="full" align="center" justify="center" p={6}>
      <Stack
        maxW="440px"
        gap={4}
        align="center"
        textAlign="center"
        p={8}
        borderWidth="1px"
        borderColor="border.muted"
        borderRadius="lg"
        bg="bg.subtle"
      >
        <Flex boxSize={10} align="center" justify="center" borderRadius="full" bg="bg.muted" color="fg.muted">
          <Icon as={LuNetwork} boxSize={5} />
        </Flex>
        {children}
      </Stack>
    </Flex>
  );
}

/** Phylogeny tab: names → clade on the left, candidate trees and the selection on the right. */
export default observer(function PhyloTab() {
  const { explorerStore, phyloStore, speciesStore } = useStore();
  const queryCount = useQuerySpeciesCount();
  const hasLoaded = speciesStore.loaded && speciesStore.numSpecies > 0;
  const hasQuery = isQueryRunnable(explorerStore.query).ok && explorerStore.query.taxa.length > 0;
  const started = phyloStore.matches.length > 0 || phyloStore.matchProgress != null || phyloStore.speciesSource != null;

  // The store matches automatically when this tab opens (and whenever the species list
  // changes); errors land in phyloStore.error. `match` is the manual (re)start.
  const matchError = phyloStore.matchState === 'error' ? phyloStore.error : null;
  const match = useCallback(() => {
    void phyloStore.matchNames();
  }, [phyloStore]);

  if (matchError && phyloStore.matches.length === 0 && phyloStore.matchProgress == null) {
    return (
      <StartCard>
        <Alert.Root status="error" size="sm" borderRadius="md" textAlign="start">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Couldn't match names with Open Tree</Alert.Title>
            <Alert.Description wordBreak="break-word">{matchError}</Alert.Description>
          </Alert.Content>
        </Alert.Root>
        <Button size="sm" variant="outline" onClick={match}>
          <LuRotateCw /> Retry
        </Button>
      </StartCard>
    );
  }

  if (!started && !hasLoaded) {
    if (!hasQuery) {
      return (
        <StartCard>
          <Stack gap={1.5}>
            <Heading as="h3" size="sm">
              No species to place on a tree yet
            </Heading>
            <Text textStyle="sm" color="fg.muted">
              Load occurrence data or build a query first. Its species are matched to the Open Tree of Life, and you
              pick a published tree to weight the bioregions by phylogeny.
            </Text>
          </Stack>
          <Button size="sm" variant="outline" onClick={() => explorerStore.setTab('occurrences')}>
            <LuArrowLeft /> Go to Occurrences
          </Button>
        </StartCard>
      );
    }
    return (
      <StartCard>
        <Stack gap={1.5}>
          <Heading as="h3" size="sm">
            Find a tree for your query
          </Heading>
          <Text textStyle="sm" color="fg.muted">
            Nothing is loaded yet, so the species come from the current query. Matching sends the names to the Open
            Tree of Life and finds their clade and published trees.
          </Text>
        </Stack>
        <Button size="sm" data-testid="phylo-match-query" onClick={match}>
          <LuGitFork />
          {queryCount != null
            ? `Match the ${fmtInt(queryCount)} species in the current query`
            : 'Match the species in the current query'}
        </Button>
      </StartCard>
    );
  }

  return (
    <Grid data-testid="phylo-tab" templateColumns="360px minmax(0, 1fr)" h="full" minH={0}>
      <Box as="aside" aria-label="Names and clade" borderRightWidth="1px" borderColor="border" overflowY="auto" minH={0}>
        <Stack gap={0} separator={<Box borderTopWidth="1px" borderColor="border.muted" />}>
          <NameMatchSummary />
          <CladeCard />
        </Stack>
      </Box>
      <Flex direction="column" minH={0} minW={0}>
        <TreeSourceTable />
        <TreeSelectionSummary />
      </Flex>
    </Grid>
  );
});
