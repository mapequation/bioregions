import { Box, Button, chakra, Flex, HStack, Icon, SegmentGroup, Skeleton, Text } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { LuCircleAlert, LuCircleCheck, LuCircleX, LuInfo, LuRefreshCw, LuSearchX, LuTriangleAlert } from 'react-icons/lu';
import { NumberInputField, NumberInputRoot } from '@/components/ui/number-input';
import { InfoTip } from '@/components/ui/toggle-tip';
import { Tooltip } from '@/components/ui/tooltip';
import { useStore } from '@/store';
import { NO_MATCHES_REASON } from '@/store/ExplorerStore';
import { primaryButtonProps } from '../buttonStyles';
import { fmtBytes, fmtCompact, fmtInt } from '../format';
import { acceptedOf, EMPTY_REASON_SHORT, EMPTY_TITLE, emptyReasonOf } from '../preview/cleaningSteps';
import LoadProgress from './LoadProgress';
import { fmtApproxMinutes, modEnterLabel, niceCapAbove, yearsToFitCap } from './loadMath';

const MODE_ITEMS = [
  { value: 'replace', label: 'Replace' },
  { value: 'add', label: 'Add' },
];

const EMPTY_REASON = 'Add a taxon or narrow the area to a region';
const DUPLICATES_HINT = 'duplicates removed while loading';
/** Container query for a dock too narrow for the full estimate line on one row. */
const NARROW = '@container loadEstimate (max-width: 44rem)';
const MIN_CAP = 1000;
const SHORTCUT = modEnterLabel(typeof navigator === 'undefined' ? '' : navigator.platform);

const Sep = () => (
  <Box as="span" aria-hidden color="fg.muted" mx={1.5}>
    ·
  </Box>
);

/**
 * Estimate line: "16,158 species-level records · duplicates removed while loading · 2.4 MB ·
 * <1 min · 3 requests". The count is what the load requests, so it never over-promises.
 */
const EstimateLine = observer(function EstimateLine() {
  const { explorerStore: ex } = useStore();
  const { estimate, kpis, previewState, canLoad } = ex;
  const busy = previewState === 'first' || previewState === 'stale' || ex.plans.state === 'loading';

  if (!canLoad.ok && canLoad.reason === NO_MATCHES_REASON) {
    return (
      <HStack
        gap={2}
        fontSize="sm"
        minW={0}
        opacity={busy ? 0.55 : 1}
        transition="opacity 0.2s"
        aria-busy={busy}
        data-testid="load-estimate"
        data-state="no-matches"
      >
        <Icon as={LuSearchX} boxSize={4} color="fg.muted" flexShrink={0} aria-hidden />
        <Text truncate>
          <Box as="span" color="fg" fontWeight="semibold">
            {NO_MATCHES_REASON}
          </Box>
          <Sep />
          <Box as="span" color="fg.muted">
            widen the area, years or filters
          </Box>
        </Text>
      </HStack>
    );
  }

  if (!estimate && !kpis) {
    if (previewState === 'first') {
      return (
        <Box aria-busy="true" aria-label="Estimating load size">
          <Skeleton h={4} w="18rem" borderRadius="sm" />
        </Box>
      );
    }
    const reason = !canLoad.ok && canLoad.reason === EMPTY_REASON ? EMPTY_REASON : 'No estimate yet';
    return (
      <HStack gap={2} color="fg.muted" fontSize="sm" minW={0}>
        <Icon as={LuInfo} boxSize={4} flexShrink={0} />
        <Text truncate>{reason}</Text>
      </HStack>
    );
  }

  const records = estimate?.records ?? kpis?.records ?? 0;
  const exact = estimate?.exact ?? false;
  const what = exact ? 'species-level records' : 'matching records';
  const full = [
    `${exact ? '' : '≈'}${fmtInt(records)} ${what}`,
    DUPLICATES_HINT,
    ...(estimate
      ? [
          fmtBytes(estimate.bytes),
          fmtApproxMinutes(estimate.seconds),
          `${fmtInt(estimate.requests)} ${estimate.requests === 1 ? 'request' : 'requests'}`,
        ]
      : ['size and time follow once the load is planned']),
  ].join(' · ');
  return (
    <HStack
      gap={1}
      minW={0}
      opacity={busy ? 0.55 : 1}
      transition="opacity 0.2s"
      aria-busy={busy}
      data-testid="load-estimate"
    >
      <Text fontSize="sm" color="fg.muted" truncate minW={0} fontVariantNumeric="tabular-nums" title={full}>
        <Box as="span" color="fg" fontWeight="semibold">
          {exact ? '' : '≈'}
          {fmtInt(records)} {what}
        </Box>
        {/* In a narrow dock the hint moves into the info tip so the line stays on one row. */}
        <Box as="span" css={{ [NARROW]: { display: 'none' } }}>
          <Sep />
          <span data-testid="load-duplicates-hint">{DUPLICATES_HINT}</span>
        </Box>
        {estimate ? (
          <>
            <Sep />
            {fmtBytes(estimate.bytes)}
            <Sep />
            {fmtApproxMinutes(estimate.seconds)}
            <Sep />
            {fmtInt(estimate.requests)} {estimate.requests === 1 ? 'request' : 'requests'}
          </>
        ) : (
          <>
            <Sep />
            size and time follow once the load is planned
          </>
        )}
      </Text>
      <Box flexShrink={0} display="none" css={{ [NARROW]: { display: 'inline-flex' } }}>
        <InfoTip>
          <Box maxW="240px">Duplicates are removed while loading, so the loaded count can be a little lower.</Box>
        </InfoTip>
      </Box>
    </HStack>
  );
});

/** Done state after a load of the current query: status text only (the actions live in LoadedPanel). */
const DoneRow = observer(function DoneRow() {
  const { explorerStore: ex } = useStore();
  const last = ex.lastLoad;
  if (!last) return null;
  const empty = emptyReasonOf(last);
  if (empty) {
    // A cancelled-early load offers "Load again" in the panel above; the others need a new query.
    const retry = empty === 'cancelledEarly' && ex.canLoad.ok;
    return (
      <HStack gap={2} minH={10} minW={0} role="status" data-testid="load-done" data-state="empty">
        <Icon
          as={LuCircleAlert}
          boxSize={4}
          color={empty === 'cancelledEarly' ? 'fg.muted' : 'orange.fg'}
          flexShrink={0}
          aria-hidden
        />
        <Text fontSize="sm" color="fg.muted" truncate minW={0}>
          <Box as="span" color="fg" fontWeight="semibold">
            {EMPTY_TITLE}
          </Box>
          <Sep />
          {EMPTY_REASON_SHORT[empty]}
          {last.previousKept && (
            <>
              <Sep />
              previous data unchanged
            </>
          )}
          {!retry && (
            <>
              <Sep />
              Edit the query to load again
            </>
          )}
        </Text>
      </HStack>
    );
  }
  const accepted = acceptedOf(last);
  const partial = last.partial != null;
  return (
    <HStack gap={2} minH={10} minW={0} role="status" data-testid="load-done" data-state={partial ? 'partial' : 'complete'}>
      <Icon
        as={partial ? LuTriangleAlert : LuCircleCheck}
        boxSize={4}
        color={partial ? 'orange.fg' : 'green.fg'}
        flexShrink={0}
        aria-hidden
      />
      <Text fontSize="sm" color="fg.muted" truncate fontVariantNumeric="tabular-nums">
        <Box as="span" color="fg" fontWeight="semibold">
          {last.mode === 'add' ? 'Added' : 'Loaded'} {fmtInt(accepted)} records
        </Box>
        {partial && (
          <Box as="span" color="orange.fg" fontWeight="semibold">
            {' (partial)'}
          </Box>
        )}
        <Sep />
        Edit the query to load again
      </Text>
    </HStack>
  );
});

/** Cap number input; commits valid values to the store as the user types. */
const CapField = observer(function CapField() {
  const { explorerStore: ex } = useStore();
  const id = useId();
  const [text, setText] = useState(String(ex.cap));
  useEffect(() => setText(String(ex.cap)), [ex.cap]);
  return (
    <HStack gap={2}>
      <chakra.label htmlFor={id} fontSize="sm" color="fg.muted">
        Cap
      </chakra.label>
      <NumberInputRoot
        ids={{ input: id }}
        size="sm"
        w="8.5rem"
        min={MIN_CAP}
        step={50_000}
        value={text}
        formatOptions={{ maximumFractionDigits: 0, useGrouping: true }}
        onValueChange={(e) => {
          setText(e.value);
          if (Number.isFinite(e.valueAsNumber) && e.valueAsNumber >= MIN_CAP) ex.setCap(Math.round(e.valueAsNumber));
        }}
        disabled={!!ex.job && (ex.job.state === 'planning' || ex.job.state === 'streaming')}
        data-testid="load-cap"
      >
        <NumberInputField fontVariantNumeric="tabular-nums" aria-label="Record cap" />
      </NumberInputRoot>
    </HStack>
  );
});

/** Amber row with the four over-cap actions. */
const OverCapRow = observer(function OverCapRow() {
  const { explorerStore: ex } = useStore();
  const est = ex.estimate;
  if (!est?.overCap) return null;
  const q = ex.query;
  const hist = ex.mergedYearsAll;
  const minY = hist.length ? Math.min(...hist.map((b) => b.year)) : null;
  const maxY = hist.length ? Math.max(...hist.map((b) => b.year)) : null;
  const from = q.years[0] ?? minY;
  const to = q.years[1] ?? maxY;
  const narrowFrom =
    from != null && to != null && est.records > 0
      ? yearsToFitCap(hist, [from, to], (ex.cap / est.records) * 0.95)
      : null;
  const raiseTo = niceCapAbove(est.records);
  return (
    <Flex
      colorPalette="orange"
      bg="colorPalette.subtle"
      color="colorPalette.fg"
      borderRadius="md"
      px={3}
      py={1.5}
      gap={2}
      align="center"
      wrap="wrap"
      role="status"
      data-testid="load-overcap"
    >
      <HStack gap={2} flex="1 1 18rem" minW={0}>
        <Icon as={LuTriangleAlert} boxSize={4} flexShrink={0} />
        <Text fontSize="sm" fontWeight="medium" fontVariantNumeric="tabular-nums">
          {fmtCompact(est.records)} records exceed the {fmtCompact(ex.cap)} cap (≈{fmtBytes(est.bytes)})
        </Text>
      </HStack>
      <HStack gap={1.5} wrap="wrap">
        <Button size="xs" variant="outline" onClick={() => ex.setCap(raiseTo)}>
          Raise cap to {fmtCompact(raiseTo)}
        </Button>
        {narrowFrom != null && to != null && narrowFrom > (from ?? -Infinity) && (
          <Button size="xs" variant="outline" onClick={() => ex.setYears([narrowFrom, to])}>
            Narrow years to {narrowFrom}–{to}
          </Button>
        )}
        {q.quality.dedupe !== 'cell' && (
          <Button size="xs" variant="outline" onClick={() => ex.setQuality({ dedupe: 'cell' })}>
            One per ~1 km cell
          </Button>
        )}
        {q.sources.gbif && (
          <Button size="xs" variant="outline" onClick={() => ex.setTab('cite')}>
            Request GBIF download instead
          </Button>
        )}
      </HStack>
    </Flex>
  );
});

/** Bottom dock: estimate, cap, Replace/Add and the Load button; becomes LoadProgress (same height) while loading. */
export default observer(function LoadDock() {
  const { explorerStore: ex, speciesStore } = useStore();
  const { job, canLoad, estimate, lastLoad, loadMode } = ex;
  const loading = !!job && (job.state === 'planning' || job.state === 'streaming');
  const rootRef = useRef<HTMLDivElement>(null);
  // Height of the dock before the load started: the progress row keeps it, so nothing above moves.
  const idleHeight = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (!loading && rootRef.current) idleHeight.current = rootRef.current.offsetHeight;
  });

  if (loading)
    return (
      <Flex
        ref={rootRef}
        direction="column"
        justify="center"
        px={3}
        py={2}
        minH={idleHeight.current != null ? `${idleHeight.current}px` : undefined}
        data-testid="load-dock"
      >
        <LoadProgress />
      </Flex>
    );

  // An empty load ends as a job error; the dock says why in the neutral empty row instead.
  const emptyLoad = lastLoad != null && emptyReasonOf(lastLoad) != null;
  if (ex.loadedMatchesQuery && (job?.state !== 'error' || emptyLoad)) {
    return (
      <Box ref={rootRef} px={3} py={2} data-testid="load-dock">
        <DoneRow />
      </Box>
    );
  }

  const dirty = !!lastLoad && ex.dirty.size > 0;
  // The count lives in the estimate line; the button never promises a number.
  const label = loadMode === 'add' ? 'Add records' : dirty ? 'Reload with changes' : 'Load records';
  const reason = canLoad.ok ? null : canLoad.reason;
  // Reasons already said elsewhere in the dock are not repeated next to the button.
  const inlineReason =
    reason && reason !== EMPTY_REASON && reason !== NO_MATCHES_REASON && !(estimate?.overCap && reason === 'Over the cap')
      ? reason
      : null;

  return (
    <Flex ref={rootRef} direction="column" gap={2} px={3} py={2} data-testid="load-dock">
      {job?.state === 'error' && (
        <Flex
          colorPalette="red"
          bg="colorPalette.subtle"
          color="colorPalette.fg"
          borderRadius="md"
          px={3}
          py={1.5}
          gap={2}
          align="center"
          role="alert"
        >
          <Icon as={LuCircleX} boxSize={4} flexShrink={0} />
          <Text fontSize="sm" flex="1" minW={0} truncate>
            Load failed{job.error ? `: ${job.error}` : ''}.
            {(emptyLoad ? lastLoad?.previousKept : speciesStore.numRecords > 0) && ' Your previous data is unchanged.'}
          </Text>
          <Button size="xs" variant="outline" onClick={() => ex.load()}>
            Try again
          </Button>
        </Flex>
      )}
      <OverCapRow />
      <Flex align="center" gap={{ base: 2, xl: 4 }} rowGap={2} wrap="wrap" minH={10}>
        <Box flex="1 1 16rem" minW={0} css={{ containerType: 'inline-size', containerName: 'loadEstimate' }}>
          <EstimateLine />
        </Box>
        <HStack gap={4} flexShrink={0}>
          <CapField />
          <SegmentGroup.Root
            size="sm"
            value={loadMode}
            onValueChange={(e) => {
              if (e.value === 'replace' || e.value === 'add') ex.setLoadMode(e.value);
            }}
            aria-label="Load mode"
            data-testid="load-mode"
          >
            <SegmentGroup.Indicator />
            <SegmentGroup.Items items={MODE_ITEMS} />
          </SegmentGroup.Root>
        </HStack>
        <HStack gap={3} flexShrink={0} ms="auto">
          {inlineReason && (
            <Text fontSize="sm" color="fg.muted" data-testid="load-disabled-reason">
              {inlineReason}
            </Text>
          )}
          <Tooltip
            content={reason ?? `${loadMode === 'add' ? 'Add to the current data' : 'Load'} (${SHORTCUT})`}
            disabled={!reason}
            openDelay={300}
          >
            <Box as="span" display="inline-flex">
              <Button
                {...primaryButtonProps}
                disabled={!canLoad.ok}
                onClick={() => ex.load()}
                aria-keyshortcuts="Control+Enter Meta+Enter"
                fontVariantNumeric="tabular-nums"
                data-testid="load-button"
              >
                {dirty && loadMode !== 'add' && <LuRefreshCw />}
                {label}
                <Box as="span" aria-hidden fontSize="xs" opacity={0.7} ms={1} fontWeight="normal">
                  {SHORTCUT}
                </Box>
              </Button>
            </Box>
          </Tooltip>
        </HStack>
      </Flex>
    </Flex>
  );
});
