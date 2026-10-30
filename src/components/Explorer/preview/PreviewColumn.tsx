import { Box, Button, Heading, HStack, Icon, Stack, Text } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { useEffect, useState } from 'react';
import { LuCircleAlert, LuClock, LuRotateCw, LuSearchX } from 'react-icons/lu';
import { isQueryRunnable } from '@/sources';
import type { SourceId } from '@/sources/types';
import { useStore } from '../../../store';
import { explorerUi, useInsightsDrawer } from '../explorerUi';
import { fmtInt } from '../format';
import ExampleCards from '../library/ExampleCards';
import LoadedPanel from '../load/LoadedPanel';
import DecisionLedger from './DecisionLedger';
import KpiStrip from './KpiStrip';
import PreviewMap from './PreviewMap';

const SOURCE_NAME: Record<SourceId, string> = { gbif: 'GBIF', obis: 'OBIS' };
const MAX_ATTEMPTS = 5;

/** Re-render every second while some source waits to retry. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

/** One-line source problems above the KPIs: failures with Retry, rate limits with a countdown. */
const SourceStatusLines = observer(function SourceStatusLines() {
  const { explorerStore } = useStore();
  const ids = (Object.keys(explorerStore.sources) as SourceId[]).filter((id) => explorerStore.query.sources[id]);
  const limited = ids.filter((id) => explorerStore.sources[id].state === 'rateLimited');
  const failed = ids.filter((id) => explorerStore.sources[id].state === 'error');
  const now = useNow(limited.length > 0);
  if (limited.length === 0 && failed.length === 0) return null;
  return (
    <Stack gap={1.5} mb={2}>
      {failed.map((id) => {
        const s = explorerStore.sources[id];
        return (
          <HStack
            key={id}
            role="alert"
            gap={2}
            px={3}
            py={1.5}
            borderRadius="md"
            colorPalette="red"
            bg="colorPalette.subtle"
            color="colorPalette.fg"
            fontSize="sm"
          >
            <Icon as={LuCircleAlert} flexShrink={0} />
            <Text flex="1" minW={0} truncate>
              {SOURCE_NAME[id]} preview failed{s.error ? ` (${s.error})` : ''}
            </Text>
            <Button size="xs" variant="outline" colorPalette="red" onClick={() => explorerStore.retrySource(id)}>
              <LuRotateCw />
              Retry
            </Button>
          </HStack>
        );
      })}
      {limited.map((id) => {
        const s = explorerStore.sources[id];
        const secs = s.retryAt ? Math.max(0, Math.ceil((s.retryAt - now) / 1000)) : null;
        return (
          <HStack
            key={id}
            role="status"
            gap={2}
            px={3}
            py={1.5}
            borderRadius="md"
            colorPalette="orange"
            bg="colorPalette.subtle"
            color="colorPalette.fg"
            fontSize="sm"
            fontVariantNumeric="tabular-nums"
          >
            <Icon as={LuClock} flexShrink={0} />
            <Text flex="1" minW={0} truncate>
              {SOURCE_NAME[id]} is busy, {secs ? `retrying in ${secs} s` : 'retrying now'}
              {s.attempt ? ` (attempt ${s.attempt}/${MAX_ATTEMPTS})` : ''}
            </Text>
            <Button size="xs" variant="ghost" colorPalette="orange" onClick={() => explorerStore.retrySource(id)}>
              Retry now
            </Button>
          </HStack>
        );
      })}
    </Stack>
  );
});

/** "No records match" with a one-click relax of the biggest restriction. */
const ZeroResults = observer(function ZeroResults() {
  const { explorerStore } = useStore();
  const big = explorerStore.biggestRestriction;
  const area = explorerStore.query.area.kind !== 'world';
  return (
    <HStack
      role="status"
      gap={3}
      px={3}
      py={2.5}
      mb={3}
      borderRadius="md"
      borderWidth="1px"
      borderColor="border"
      bg="bg.subtle"
      align="center"
    >
      <Icon as={LuSearchX} color="fg.muted" boxSize={5} flexShrink={0} />
      <Box flex="1" minW={0} fontSize="sm">
        {big ? (
          <>
            <Text fontWeight="semibold">No records match.</Text>
            <Text color="fg.muted" fontVariantNumeric="tabular-nums">
              Biggest restriction: {big.row.label}
              {big.row.impact != null ? ` (removes ${fmtInt(big.row.impact)} on its own)` : ''}
            </Text>
          </>
        ) : (
          <>
            <Text fontWeight="semibold">No records for these taxa here.</Text>
            <Text color="fg.muted">Try a wider area or another taxon.</Text>
          </>
        )}
      </Box>
      {big ? (
        <Button size="sm" variant="outline" onClick={() => big.relax()}>
          {big.relaxLabel}
        </Button>
      ) : (
        area && (
          <Button size="sm" variant="outline" onClick={() => explorerStore.setArea({ kind: 'world' })}>
            Use World
          </Button>
        )
      )}
    </HStack>
  );
});

/** Empty query: a short prompt in the KPI slot, a faint world map and the example studies. */
const EmptyPreview = observer(function EmptyPreview() {
  const { explorerStore } = useStore();
  const runnable = isQueryRunnable(explorerStore.query);
  const q = explorerStore.query;
  const needsTaxonOrArea = runnable.ok || (q.taxa.length === 0 && q.area.kind === 'world');
  return (
    <Stack gap={4}>
      <Box minH="52px">
        <Heading as="h3" size="sm" fontWeight="semibold">
          Start with a taxon or an area
        </Heading>
        <Text fontSize="sm" color="fg.muted" mt={1} maxW="68ch">
          {needsTaxonOrArea
            ? 'Search for a taxon, pick a region or draw a box on the map. Counts, the density map and the decision ledger update as you go.'
            : runnable.reason}
        </Text>
      </Box>
      <PreviewMap faint />
      <ExampleCards />
    </Stack>
  );
});

/** The drawer button alone, for the frozen state where the success panel replaces the KPIs. */
const InsightsButton = observer(function InsightsButton() {
  const { explorerStore } = useStore();
  const flags = explorerStore.biasFlags.filter((f) => f.triggered).length;
  return (
    <Button size="sm" variant="outline" onClick={() => explorerUi.setInsightsOpen(true)} data-testid="insights-toggle">
      Insights{flags > 0 ? ` · ⚠ ${flags}` : ''}
    </Button>
  );
});

/** Centre column of the Occurrences tab: KPIs (or the success panel), map and ledger. */
export default observer(function PreviewColumn() {
  const { explorerStore } = useStore();
  const drawer = useInsightsDrawer();
  const { job, lastLoad, previewState } = explorerStore;
  const loading = job != null && (job.state === 'planning' || job.state === 'streaming');
  const unchangedSinceLoad = lastLoad != null && explorerStore.dirty.size === 0;
  const mode = loading ? 'live' : unchangedSinceLoad ? 'frozen' : 'preview';

  if (previewState === 'empty' && !loading && !unchangedSinceLoad && !isQueryRunnable(explorerStore.query).ok) {
    return (
      <Box as="section" aria-label="Preview">
        <EmptyPreview />
      </Box>
    );
  }

  const kpis = explorerStore.kpis;
  const zero = previewState === 'ready' && kpis != null && kpis.records === 0 && !loading;
  const allFailed = previewState === 'error';
  return (
    <Stack as="section" aria-label="Preview" gap={3}>
      <Box>
        <SourceStatusLines />
        {mode === 'frozen' ? <LoadedPanel /> : <KpiStrip />}
        {mode === 'frozen' && drawer && (
          <HStack justify="flex-end" mt={2}>
            <InsightsButton />
          </HStack>
        )}
      </Box>
      {zero && <ZeroResults />}
      {allFailed && (
        <Text fontSize="sm" color="fg.muted">
          No preview yet: every source failed. Retry above, or check your connection.
        </Text>
      )}
      <PreviewMap />
      <Box pt={1}>
        <DecisionLedger mode={mode} />
      </Box>
    </Stack>
  );
});
