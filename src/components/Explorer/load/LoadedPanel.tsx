import { Alert, Box, Button, Flex, Grid, HStack, Icon, Spinner, Text } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import type { ReactNode } from 'react';
import { LuCircleCheck, LuMap, LuQuote } from 'react-icons/lu';
import { useStore } from '@/store';
import { fmtInt, fmtPct } from '../format';

const Sep = () => (
  <Box as="span" aria-hidden color="fg.muted" mx={1.5}>
    ·
  </Box>
);

function timeOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}

export interface LoadedPanelProps {
  /** Extra action before "Cite this data", e.g. the insights drawer button. */
  extra?: ReactNode;
}

/** Success panel shown in place of the KPI strip after a load, with the partial-load banner. */
export default observer(function LoadedPanel({ extra }: LoadedPanelProps) {
  const { explorerStore: ex, infomapStore, speciesStore } = useStore();
  const last = ex.lastLoad;
  if (!last) return null;

  const records = last.funnel.accepted;
  const species = last.kpis.species;
  const datasetKeys = Object.values(last.datasetCounts).reduce((s, list) => s + (list?.length ?? 0), 0);
  const datasets = datasetKeys || last.kpis.datasets;
  const sources = Object.values(last.funnel.bySource).filter((s) => (s?.accepted ?? 0) > 0).length;
  const computing = infomapStore.isRunning || speciesStore.isLoading;
  const regions = infomapStore.numBioregions;
  const time = timeOf(last.retrievedAt);
  const partial = last.partial;
  // How the matching records became the dataset (same chain as the decision ledger).
  const matching = ex.countStory.matching;
  const notSpecies = ex.ledger.find((r) => r.id === 'speciesLevel')?.impact ?? null;
  const dup = ex.countStory.duplicates ?? last.funnel.dropped.duplicate ?? 0;
  const other = matching != null ? matching - (notSpecies ?? 0) - dup - records : 0;
  const story =
    matching != null && matching > 0 && last.mode !== 'add'
      ? `From ${fmtInt(matching)} matching records: ${[
          notSpecies ? `${fmtInt(notSpecies)} not identified to species` : null,
          `${fmtInt(dup)} duplicates`,
          other > 0 ? `${fmtInt(other)} other` : null,
        ]
          .filter(Boolean)
          .join(', ')} removed.`
      : null;

  return (
    <Flex direction="column" gap={2} data-testid="loaded-panel">
      {partial && (
        <Alert.Root status="warning" size="sm" variant="subtle" borderRadius="md" py={2}>
          <Alert.Indicator />
          <Alert.Description fontSize="sm" fontVariantNumeric="tabular-nums">
            <Box as="span" fontWeight="semibold">
              Partial dataset:
            </Box>{' '}
            {fmtInt(partial.accepted)} of ~{fmtInt(partial.planned)} planned records (
            {fmtPct(partial.planned > 0 ? partial.accepted / partial.planned : 0)}). Some species may be
            under-sampled. The methods text says so.
          </Alert.Description>
        </Alert.Root>
      )}
      <Grid
        templateColumns="auto minmax(0, 1fr) auto"
        columnGap={3}
        rowGap={0.5}
        alignItems="center"
        px={3}
        py={2.5}
        borderRadius="md"
        borderWidth="1px"
        borderColor="green.muted"
        bg="green.subtle"
        role="status"
        aria-live="polite"
        fontVariantNumeric="tabular-nums"
      >
        <Icon
          as={LuCircleCheck}
          boxSize={6}
          color="green.fg"
          gridRow="1 / span 3"
          alignSelf="start"
          mt="4px"
          aria-hidden
        />
        <HStack gap={2} minW={0} align="baseline">
          <Text fontSize="md" fontWeight="semibold" color="fg" truncate>
            {last.mode === 'add' ? 'Added' : 'Loaded'} {fmtInt(records)} records
          </Text>
          {time && (
            <Text as="span" title={last.retrievedAt} fontSize="xs" color="fg.muted" flexShrink={0}>
              at {time}
            </Text>
          )}
        </HStack>
        <HStack gap={2} flexShrink={0}>
          {extra}
          <Button size="sm" variant="outline" bg="bg" onClick={() => ex.setTab('cite')}>
            <LuQuote /> Cite this data
          </Button>
          <Button size="sm" variant="solid" onClick={() => ex.close()} data-testid="view-bioregions">
            <LuMap /> View bioregions
          </Button>
        </HStack>
        <Flex gridColumn="2 / -1" fontSize="xs" color="fg.muted" wrap="wrap" align="center" minW={0}>
          <Text>
            {[
              species != null ? `${fmtInt(species)} species` : null,
              datasets ? `${fmtInt(datasets)} ${datasets === 1 ? 'dataset' : 'datasets'}` : null,
              sources > 0 ? `${sources} ${sources === 1 ? 'source' : 'sources'}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {(computing || regions > 0) && <Sep />}
          {computing ? (
            <HStack gap={1.5}>
              <Spinner size="xs" />
              <Text>Bioregions computing…</Text>
            </HStack>
          ) : regions > 0 ? (
            <Text color="fg" fontWeight="medium">
              {regions} {regions === 1 ? 'bioregion' : 'bioregions'} ready
            </Text>
          ) : null}
        </Flex>
        {story && (
          <Text gridColumn="2 / -1" fontSize="xs" color="fg.muted" data-testid="loaded-story">
            {story}
          </Text>
        )}
      </Grid>
    </Flex>
  );
});
