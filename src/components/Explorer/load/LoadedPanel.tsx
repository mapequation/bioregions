import { Alert, Box, Button, Flex, Grid, HStack, Icon, Spinner, Text } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import type { ReactNode } from 'react';
import { LuCircleAlert, LuCircleCheck, LuMap, LuQuote, LuRotateCw } from 'react-icons/lu';
import { useStore } from '@/store';
import { fmtInt } from '../format';
import {
  acceptedOf,
  EMPTY_REASON_TEXT,
  EMPTY_TITLE,
  type EmptyReason,
  emptyReasonOf,
  notReceivedOf,
  PARTIAL_BIAS,
  PREVIOUS_KEPT,
  partialSummary,
} from '../preview/cleaningSteps';

const Sep = () => (
  <Box as="span" aria-hidden color="fg.muted" mx={1.5}>
    ·
  </Box>
);

function timeOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}

/** Shown instead of the success panel when a load kept no records: why, and that nothing was replaced. */
const EmptyPanel = observer(function EmptyPanel({ reason, previousKept }: { reason: EmptyReason; previousKept?: boolean }) {
  const { explorerStore: ex } = useStore();
  const retry = reason === 'cancelledEarly' && ex.canLoad.ok;
  return (
    <Flex direction="column" gap={2} data-testid="loaded-panel" data-state="empty">
      <Grid
        templateColumns="auto minmax(0, 1fr) auto"
        columnGap={3}
        rowGap={0.5}
        alignItems="center"
        px={3}
        py={2.5}
        borderRadius="md"
        borderWidth="1px"
        colorPalette={reason === 'cancelledEarly' ? 'gray' : 'orange'}
        borderColor="colorPalette.muted"
        bg="colorPalette.subtle"
        role="status"
        aria-live="polite"
      >
        <Icon as={LuCircleAlert} boxSize={6} color="colorPalette.fg" gridRow="1 / span 2" alignSelf="start" mt="4px" aria-hidden />
        <Text fontSize="md" fontWeight="semibold" color="fg" data-testid="loaded-empty-title">
          {EMPTY_TITLE}
        </Text>
        <Box>
          {retry && (
            <Button size="sm" variant="outline" bg="bg" onClick={() => ex.load()}>
              <LuRotateCw /> Load again
            </Button>
          )}
        </Box>
        <Text gridColumn="2 / -1" fontSize="sm" color="fg.muted" data-testid="loaded-empty-reason">
          {EMPTY_REASON_TEXT[reason]}
          {previousKept ? ` ${PREVIOUS_KEPT}` : ''}
        </Text>
      </Grid>
    </Flex>
  );
});

export interface LoadedPanelProps {
  /** Extra action before "Cite this data", e.g. the insights drawer button. */
  extra?: ReactNode;
}

/** Success panel shown in place of the KPI strip after a load, with the partial-load banner. */
export default observer(function LoadedPanel({ extra }: LoadedPanelProps) {
  const { explorerStore: ex, infomapStore, speciesStore } = useStore();
  const last = ex.lastLoad;
  if (!last) return null;

  const empty = emptyReasonOf(last);
  if (empty) return <EmptyPanel reason={empty} previousKept={last.previousKept} />;

  const records = acceptedOf(last);
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
  // A cancelled load stops part-way: the rest was never received, not removed.
  const notLoaded = notReceivedOf(last);
  const other = matching != null ? Math.max(0, matching - (notSpecies ?? 0) - dup - records - notLoaded) : 0;
  const removed = [
    notSpecies ? `${fmtInt(notSpecies)} not identified to species` : null,
    `${fmtInt(dup)} duplicates`,
    other > 0 ? `${fmtInt(other)} other` : null,
  ].filter(Boolean);
  const removedText =
    removed.length > 1 ? `${removed.slice(0, -1).join(', ')} and ${removed[removed.length - 1]}` : removed[0];
  const story =
    matching != null && matching > 0 && last.mode !== 'add'
      ? `From ${fmtInt(matching)} records matching all filters: ${removedText} removed${
          notLoaded > 0 ? `; ${fmtInt(notLoaded)} not loaded (cancelled)` : ''
        }.`
      : null;

  return (
    <Flex direction="column" gap={2} data-testid="loaded-panel">
      {partial && (
        <Alert.Root status="warning" size="sm" variant="subtle" borderRadius="md" py={2} data-testid="loaded-partial">
          <Alert.Indicator />
          <Alert.Description fontSize="sm" fontVariantNumeric="tabular-nums">
            <Box as="span" fontWeight="semibold">
              Partial dataset:
            </Box>{' '}
            {partialSummary(partial)} {PARTIAL_BIAS}
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
