import { Box, Button, chakra, Flex, HStack, Icon, SegmentGroup, Skeleton, Text } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { useEffect, useId, useState } from 'react';
import { LuCircleCheck, LuCircleX, LuInfo, LuMap, LuQuote, LuRefreshCw, LuTriangleAlert } from 'react-icons/lu';
import { NumberInputField, NumberInputRoot } from '@/components/ui/number-input';
import { Tooltip } from '@/components/ui/tooltip';
import { useStore } from '@/store';
import { fmtBytes, fmtCompact, fmtInt } from '../format';
import LoadProgress from './LoadProgress';
import { fmtApproxMinutes, modEnterLabel, niceCapAbove, yearsToFitCap } from './loadMath';

const MODE_ITEMS = [
  { value: 'replace', label: 'Replace' },
  { value: 'add', label: 'Add' },
];

const EMPTY_REASON = 'Add a taxon or narrow the area to a region';
const DUPLICATES_HINT = 'duplicates are removed while loading';
const MIN_CAP = 1000;
const SHORTCUT = modEnterLabel(typeof navigator === 'undefined' ? '' : navigator.platform);

const Sep = () => (
  <Box as="span" aria-hidden color="fg.muted" mx={1.5}>
    ·
  </Box>
);

/** Estimate line: "≈16,158 records · 61 MB · ~2 min · 96 requests", over the duplicates hint. */
const EstimateLine = observer(function EstimateLine() {
  const { explorerStore: ex } = useStore();
  const { estimate, kpis, previewState, canLoad } = ex;
  const busy = previewState === 'first' || previewState === 'stale' || ex.plans.state === 'loading';

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
  return (
    <Box minW={0}>
    <Text
      fontSize="sm"
      color="fg.muted"
      truncate
      fontVariantNumeric="tabular-nums"
      opacity={busy ? 0.55 : 1}
      transition="opacity 0.2s"
      aria-busy={busy}
      data-testid="load-estimate"
    >
      <Box as="span" color="fg" fontWeight="semibold">
        ≈{fmtInt(records)} records
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
    <Text fontSize="xs" color="fg.muted" truncate data-testid="load-duplicates-hint">
      {estimate?.exact ? `Identified to species; ${DUPLICATES_HINT}.` : `Estimate; ${DUPLICATES_HINT}.`}
    </Text>
    </Box>
  );
});

/** Done state after a load of the current query: what was loaded and where to go next. */
const DoneRow = observer(function DoneRow() {
  const { explorerStore: ex } = useStore();
  const last = ex.lastLoad;
  if (!last) return null;
  const accepted = last.funnel.accepted;
  return (
    <Flex align="center" gap={3} rowGap={2} wrap="wrap" minH={10} data-testid="load-done">
      <HStack gap={2} flex="1 1 16rem" minW={0} role="status">
        <Icon as={LuCircleCheck} boxSize={5} color="green.fg" flexShrink={0} aria-hidden />
        <Box minW={0}>
          <Text fontSize="sm" fontWeight="semibold" color="fg" truncate fontVariantNumeric="tabular-nums">
            {last.mode === 'add' ? 'Added' : 'Loaded'} {fmtInt(accepted)} records
          </Text>
          <Text fontSize="xs" color="fg.muted" truncate>
            Edit the query to load again with changes.
          </Text>
        </Box>
      </HStack>
      <HStack gap={2} flexShrink={0} ms="auto">
        <Button size="sm" variant="outline" onClick={() => ex.setTab('cite')}>
          <LuQuote />
          Cite this data
        </Button>
        <Button size="sm" variant="solid" onClick={() => ex.close()} data-testid="dock-view-bioregions">
          <LuMap />
          View bioregions
        </Button>
      </HStack>
    </Flex>
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

/** Bottom dock: estimate, cap, Replace/Add and the Load button; grows into LoadProgress while loading. */
export default observer(function LoadDock() {
  const { explorerStore: ex } = useStore();
  const { job, canLoad, estimate, kpis, lastLoad, loadMode } = ex;

  if (job && (job.state === 'planning' || job.state === 'streaming')) return (
      <Box px={3} py={2} data-testid="load-dock">
        <LoadProgress />
      </Box>
    );

  if (ex.loadedMatchesQuery && job?.state !== 'error') {
    return (
      <Box px={3} py={2} data-testid="load-dock">
        <DoneRow />
      </Box>
    );
  }

  const records = estimate?.records ?? kpis?.records ?? null;
  const dirty = !!lastLoad && ex.dirty.size > 0;
  const n = records == null ? null : `~${fmtInt(records)}`;
  const label =
    loadMode === 'add'
      ? `Add ${n ?? ''} records to current data`.replace('  ', ' ')
      : dirty
        ? 'Reload with changes'
        : `Load ${n ? `${n} ` : ''}records`;
  const reason = canLoad.ok ? null : canLoad.reason;
  // Reasons already said elsewhere in the dock are not repeated next to the button.
  const inlineReason = reason && reason !== EMPTY_REASON && !(estimate?.overCap && reason === 'Over the cap') ? reason : null;

  return (
    <Flex direction="column" gap={2} px={3} py={2} data-testid="load-dock">
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
            Load failed{job.error ? `: ${job.error}` : ''}. Loaded data was kept.
          </Text>
          <Button size="xs" variant="outline" onClick={() => ex.load()}>
            Try again
          </Button>
        </Flex>
      )}
      <OverCapRow />
      <Flex align="center" gap={{ base: 2, xl: 4 }} rowGap={2} wrap="wrap" minH={10}>
        <Box flex="1 1 16rem" minW={0}>
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
          <Tooltip content={reason ?? `Load (${SHORTCUT})`} disabled={!reason} openDelay={300}>
            <Box as="span" display="inline-flex">
              <Button
                size="sm"
                variant="solid"
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
