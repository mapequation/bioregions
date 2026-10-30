import { Box, Button, Collapsible, Flex, Grid, HStack, Icon, Spinner, Text } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import type { ReactNode } from 'react';
import {
  LuChevronRight,
  LuCircleAlert,
  LuCircleCheck,
  LuMap,
  LuPlay,
  LuQuote,
  LuRotateCw,
  LuTriangleAlert,
} from 'react-icons/lu';
import { useStore } from '@/store';
import { primaryButtonProps, secondaryButtonProps } from '../buttonStyles';
import { fmtInt, fmtTimestamp } from '../format';
import {
  acceptedOf,
  EMPTY_REASON_TEXT,
  EMPTY_TITLE,
  dedupeText,
  type EmptyReason,
  emptyReasonOf,
  loadDrops,
  loadStory,
  type MissingSpecies,
  missingSpeciesOf,
  notReceivedOf,
  PREVIOUS_KEPT,
  partialSummary,
} from '../preview/cleaningSteps';
import { partialExplanation } from './partialText';

const Sep = () => (
  <Box as="span" aria-hidden color="fg.muted" mx={1.5}>
    ·
  </Box>
);

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
            <Button {...secondaryButtonProps} onClick={() => ex.load()}>
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

/** Expandable "Not loaded (23 species)" list: the species a stopped load never received. */
function MissingSpeciesList({ species }: { species: MissingSpecies[] }) {
  const known = species.filter((m) => m.expected != null);
  const total = known.reduce((s, m) => s + (m.expected ?? 0), 0);
  return (
    <Collapsible.Root gridColumn="2 / -1" mt={0.5} data-testid="loaded-missing-species">
      <Collapsible.Trigger asChild>
        <Button
          size="xs"
          variant="ghost"
          colorPalette="gray"
          color="fg"
          px={1.5}
          ms={-1.5}
          fontWeight="medium"
          focusVisibleRing="outside"
          css={{ '&[data-state=open] svg': { transform: 'rotate(90deg)' } }}
        >
          <Icon as={LuChevronRight} boxSize={3.5} transition="transform 0.15s" aria-hidden />
          Not loaded ({fmtInt(species.length)} species)
          {known.length > 0 && (
            <Box as="span" color="fg.muted" fontWeight="normal" fontVariantNumeric="tabular-nums">
              · ≈{fmtInt(total)} expected records
            </Box>
          )}
        </Button>
      </Collapsible.Trigger>
      <Collapsible.Content>
        <Box
          as="ul"
          listStyleType="none"
          mt={1}
          maxH="12rem"
          overflowY="auto"
          overscrollBehavior="contain"
          borderWidth="1px"
          borderColor="colorPalette.muted"
          borderRadius="sm"
          bg="bg"
          px={2.5}
          py={1.5}
          css={{ columnWidth: '16rem', columnGap: '1.5rem' }}
          tabIndex={0}
          focusRing="inside"
          aria-label="Species not loaded, with expected record counts"
          data-testid="loaded-missing-list"
        >
          {species.map((m) => (
            <HStack as="li" key={m.name} gap={3} fontSize="xs" py={0.5} css={{ breakInside: 'avoid' }}>
              <Text fontStyle="italic" color="fg" truncate minW={0} flex="1" title={m.name}>
                {m.name}
              </Text>
              <Text color="fg.muted" fontVariantNumeric="tabular-nums" flexShrink={0}>
                {m.expected != null ? fmtInt(m.expected) : '–'}
              </Text>
            </HStack>
          ))}
        </Box>
      </Collapsible.Content>
    </Collapsible.Root>
  );
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

  const empty = emptyReasonOf(last);
  if (empty) return <EmptyPanel reason={empty} previousKept={last.previousKept} />;

  const records = acceptedOf(last);
  const species = last.kpis.species;
  const datasetKeys = Object.values(last.datasetCounts).reduce((s, list) => s + (list?.length ?? 0), 0);
  const datasets = datasetKeys || last.kpis.datasets;
  const sources = Object.values(last.funnel.bySource).filter((s) => (s?.accepted ?? 0) > 0).length;
  const computing = infomapStore.isRunning || speciesStore.isLoading;
  const regions = infomapStore.numBioregions;
  // Same full timestamp as the Cite tab header.
  const time = fmtTimestamp(last.retrievedAt);
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
    partial: last.partial,
  });
  const story =
    matching != null && matching > 0 && last.mode !== 'add' ? loadStory({ matching, notSpecies, lowCount, drops }) : null;
  const palette = partial ? 'orange' : 'green';
  const missing = partial ? missingSpeciesOf(partial) : [];

  return (
    <Flex direction="column" gap={2} data-testid="loaded-panel" data-state={partial ? 'partial' : 'complete'}>
      <Grid
        templateColumns="auto minmax(0, 1fr)"
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
        {/* Title and actions share a row and wrap rather than truncate the title in a narrow panel. */}
        <Flex gridColumn="2 / -1" align="center" columnGap={3} rowGap={1.5} wrap="wrap" minW={0}>
          <HStack gap={2} minW={0} align="baseline" flex="1 0 auto">
            <Text fontSize="md" fontWeight="semibold" color="fg">
              {last.mode === 'add' ? 'Added' : 'Loaded'} {fmtInt(records)} records
            </Text>
            {time && (
              <Text as="span" fontSize="xs" color="fg.muted" flexShrink={0} data-testid="loaded-time">
                retrieved {time}
              </Text>
            )}
          </HStack>
          {/* Actions stay neutral, not in the panel's status colour (brand has no border token). */}
          <HStack gap={2} flexShrink={0} colorPalette="gray" ms="auto">
            {extra}
            <Button {...secondaryButtonProps} onClick={() => ex.setTab('cite')}>
              <LuQuote /> Cite this data
            </Button>
            <Button
              {...(partial ? secondaryButtonProps : primaryButtonProps)}
              onClick={() => ex.close()}
              data-testid="view-bioregions"
            >
              <LuMap /> View bioregions
            </Button>
          </HStack>
        </Flex>
        {partial && (
          <Text gridColumn="2 / -1" fontSize="sm" color="fg" data-testid="loaded-partial">
            <Box as="span" fontWeight="semibold">
              Partial dataset:
            </Box>{' '}
            {partialSummary(partial)}{' '}
            <Box as="span" color="fg.muted" data-testid="loaded-partial-reason">
              {partialExplanation(partial)}
            </Box>
          </Text>
        )}
        {missing.length > 0 && <MissingSpeciesList species={missing} />}
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
              <Button {...secondaryButtonProps} onClick={() => runAnyway.call(ex)}>
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
