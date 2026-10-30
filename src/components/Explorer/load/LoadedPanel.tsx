import { Box, Button, Flex, Grid, HStack, Icon, Spinner, Text } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import type { ReactNode } from 'react';
import { LuCircleAlert, LuCircleCheck, LuMap, LuPlay, LuQuote, LuRotateCw, LuTriangleAlert } from 'react-icons/lu';
import { useStore } from '@/store';
import { fmtInt } from '../format';
import {
  acceptedOf,
  EMPTY_REASON_TEXT,
  EMPTY_TITLE,
  dedupeText,
  type EmptyReason,
  emptyReasonOf,
  loadDrops,
  loadStory,
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
            <Button size="sm" variant="outline" bg="bg" colorPalette="gray" onClick={() => ex.load()}>
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
  const skipped = (last as { bioregionsSkipped?: boolean }).bioregionsSkipped === true;
  const runAnyway = (ex as { runBioregionsAnyway?: () => void }).runBioregionsAnyway;
  const coverage =
    partial?.speciesLoaded != null && partial.speciesPlanned != null && partial.speciesPlanned > 0
      ? ` (${fmtInt(partial.speciesLoaded)} of ${fmtInt(partial.speciesPlanned)} species)`
      : '';
  // How the matching records became the dataset, in the decision ledger's words.
  const matching = ex.countStory.matching;
  const notSpecies = ex.ledger.find((r) => r.id === 'speciesLevel')?.impact ?? null;
  const speciesLevel = matching != null && notSpecies != null ? Math.max(0, matching - notSpecies) : null;
  const planned = ex.countStory.speciesLevel;
  const lowCount = speciesLevel != null && planned != null && planned < speciesLevel ? speciesLevel - planned : 0;
  const dedupeLabel = (ex as { dedupeLabel?: string }).dedupeLabel ?? dedupeText(last.query.quality.dedupe);
  const drops = loadDrops({
    funnel: last.funnel,
    toLoad: planned ?? speciesLevel,
    // A cancelled load stops part-way: the rest was never received, not removed.
    cancelled: notReceivedOf(last),
    dedupeLabel,
  });
  const story =
    matching != null && matching > 0 && last.mode !== 'add' ? loadStory({ matching, notSpecies, lowCount, drops }) : null;
  const palette = partial ? 'orange' : 'green';

  return (
    <Flex direction="column" gap={2} data-testid="loaded-panel" data-state={partial ? 'partial' : 'complete'}>
      <Grid
        templateColumns="auto minmax(0, 1fr) auto"
        columnGap={3}
        rowGap={0.5}
        alignItems="center"
        px={3}
        py={2.5}
        borderRadius="md"
        borderWidth="1px"
        colorPalette={palette}
        borderColor="colorPalette.muted"
        bg="colorPalette.subtle"
        role="status"
        aria-live="polite"
        fontVariantNumeric="tabular-nums"
      >
        <Icon
          as={partial ? LuTriangleAlert : LuCircleCheck}
          boxSize={6}
          color="colorPalette.fg"
          gridRow="1 / span 5"
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
        {/* Actions stay neutral, not in the panel's status colour (brand has no border token). */}
        <HStack gap={2} flexShrink={0} colorPalette="gray">
          {extra}
          <Button size="sm" variant="outline" bg="bg" onClick={() => ex.setTab('cite')}>
            <LuQuote /> Cite this data
          </Button>
          <Button
            size="sm"
            variant={partial ? 'outline' : 'solid'}
            colorPalette={partial ? 'gray' : 'brand'}
            bg={partial ? 'bg' : undefined}
            onClick={() => ex.close()}
            data-testid="view-bioregions"
          >
            <LuMap /> View bioregions
          </Button>
        </HStack>
        {partial && (
          <Text gridColumn="2 / -1" fontSize="sm" color="fg" data-testid="loaded-partial">
            <Box as="span" fontWeight="semibold">
              Partial dataset:
            </Box>{' '}
            {partialSummary(partial)}{' '}
            <Box as="span" color="fg.muted">
              {PARTIAL_BIAS}
            </Box>
          </Text>
        )}
        <Flex gridColumn="2 / -1" fontSize="xs" color="fg.muted" wrap="wrap" align="center" minW={0} rowGap={1}>
          <Text>
            {[
              species != null ? `${fmtInt(species)} species` : null,
              datasets ? `${fmtInt(datasets)} ${datasets === 1 ? 'dataset' : 'datasets'}` : null,
              sources > 0 ? `${sources} ${sources === 1 ? 'source' : 'sources'}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {(computing || (!skipped && regions > 0)) && <Sep />}
          {computing ? (
            <HStack gap={1.5}>
              <Spinner size="xs" />
              <Text>Bioregions computing…</Text>
            </HStack>
          ) : !skipped && regions > 0 ? (
            <Text color="fg" fontWeight="medium">
              {regions} {regions === 1 ? 'bioregion' : 'bioregions'} ready
            </Text>
          ) : null}
        </Flex>
        {skipped && !computing && (
          <HStack gridColumn="2 / -1" gap={3} minW={0} mt={1} wrap="wrap" data-testid="loaded-bioregions-skipped">
            <Text fontSize="sm" color="fg">
              Bioregions not computed for a partial dataset{coverage}.
            </Text>
            {runAnyway && (
              <Button size="sm" variant="outline" bg="bg" colorPalette="gray" onClick={() => runAnyway.call(ex)}>
                <LuPlay /> Run anyway
              </Button>
            )}
          </HStack>
        )}
        {story && (
          <Text gridColumn="2 / -1" fontSize="xs" color="fg.muted" data-testid="loaded-story">
            {story}
          </Text>
        )}
      </Grid>
    </Flex>
  );
});
