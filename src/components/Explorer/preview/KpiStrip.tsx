import {
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  Icon,
  IconButton,
  Skeleton,
  Spinner,
  Stack,
  Text,
  useMediaQuery,
  VisuallyHidden,
} from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { type ReactNode, useEffect, useState } from 'react';
import { LuPanelRight, LuPin, LuPinOff, LuTriangleAlert, LuX } from 'react-icons/lu';
import { Tooltip } from '@/components/ui/tooltip';
import type { PreviewSummary, SourceId } from '@/sources/types';
import type { Kpis } from '@/store/explorer/types';
import { useStore } from '../../../store';
import { explorerUi, useInsightsDrawer } from '../explorerUi';
import { fmtInt } from '../format';

const SOURCE_NAME: Record<SourceId, string> = { gbif: 'GBIF', obis: 'OBIS' };
const OVERLAP_NOTE = 'OBIS partly republishes into GBIF; overlap is removed while loading.';

const yearsText = (r: [number, number] | null) => (r ? `${r[0]}–${r[1]}` : '–');

/** Below this viewport width the strip's buttons collapse to icons so the KPIs keep one row. */
const COMPACT_QUERY = '(max-width: 1179.98px)';

/** "−7.5 %" style change; one decimal below 10 %. */
function pctChange(from: number, to: number): string {
  if (from === 0) return to === 0 ? '0 %' : 'new';
  const p = ((to - from) / from) * 100;
  const a = Math.abs(p);
  const s = a < 10 ? a.toFixed(1).replace(/\.0$/, '') : String(Math.round(a));
  return `${p < 0 ? '−' : p > 0 ? '+' : ''}${s} %`;
}

interface KpiProps {
  label: string;
  value: ReactNode;
  testId: string;
  /** Per-source breakdown and caveat shown in the tooltip. */
  tip: ReactNode;
  loading: boolean;
  first: boolean;
  minW: string;
  /** One muted line under the value; the line is reserved when `caption` is not undefined. */
  caption?: ReactNode;
}

function Kpi({ label, value, testId, tip, loading, first, minW, caption }: KpiProps) {
  return (
    <Tooltip content={tip} showArrow openDelay={250} contentProps={{ maxW: '280px' }}>
      <Stack
        gap={0}
        minW={minW}
        tabIndex={0}
        borderRadius="sm"
        cursor="default"
        _focusVisible={{ outline: '2px solid', outlineColor: 'colorPalette.focusRing', outlineOffset: '2px' }}
      >
        <Text fontSize="xs" color="fg.muted" lineHeight="short" whiteSpace="nowrap">
          {label}
        </Text>
        {first ? (
          <Skeleton h="24px" w="72px" mt="2px" borderRadius="sm" />
        ) : (
          <Text
            data-testid={testId}
            fontSize="lg"
            fontWeight="semibold"
            lineHeight="28px"
            fontVariantNumeric="tabular-nums"
            whiteSpace="nowrap"
            opacity={loading ? 0.5 : 1}
            transition="opacity 0.15s"
          >
            {value}
          </Text>
        )}
        {caption !== undefined && (
          <Text
            fontSize="xs"
            color="fg.muted"
            lineHeight="16px"
            minH="16px"
            whiteSpace="nowrap"
            fontVariantNumeric="tabular-nums"
            opacity={loading ? 0.5 : 1}
            data-testid={`${testId}-caption`}
          >
            {caption}
          </Text>
        )}
      </Stack>
    </Tooltip>
  );
}

function SplitTip({ title, rows, note }: { title: string; rows: [string, string][]; note?: string }) {
  return (
    <Stack gap={1} py={0.5} fontVariantNumeric="tabular-nums">
      <Text fontWeight="semibold">{title}</Text>
      {rows.map(([k, v]) => (
        <HStack key={k} justify="space-between" gap={4}>
          <span>{k}</span>
          <span>{v}</span>
        </HStack>
      ))}
      {note && <Text opacity={0.85}>{note}</Text>}
    </Stack>
  );
}

function DeltaChip({ label, from, to }: { label: string; from: number; to: number }) {
  const same = from === to;
  return (
    <Badge size="sm" variant="subtle" colorPalette="brand" fontVariantNumeric="tabular-nums" fontWeight="normal">
      <Text as="span" color="fg.muted">
        {label}
      </Text>
      <Text as="span">{same ? fmtInt(to) : `${fmtInt(from)} → ${fmtInt(to)}`}</Text>
      {!same && (
        <Text as="span" fontWeight="semibold">
          ({pctChange(from, to)})
        </Text>
      )}
    </Badge>
  );
}

/** Headline numbers of the preview: records, species, datasets and years. */
export default observer(function KpiStrip() {
  const { explorerStore } = useStore();
  const { previewState, baseline, sources } = explorerStore;
  const kpis = explorerStore.kpis;
  const previews = explorerStore.previews;
  // The KPIs depend only on each source's headline numbers, not on the ledger impacts: they
  // dim only while a source still owes new headline numbers (a progressive preview that has
  // delivered them clears `stale` while its filter impacts load).
  const enabledSources = (Object.keys(sources) as SourceId[])
    .filter((id) => explorerStore.query.sources[id])
    .map((id) => sources[id]);
  const loading =
    previewState === 'stale' &&
    enabledSources.some((s) => (s.state === 'loading' || s.state === 'rateLimited') && (s.stale || !s.preview));
  const first = !kpis && (previewState === 'first' || previewState === 'stale');
  const drawer = useInsightsDrawer();
  const [compact] = useMediaQuery([COMPACT_QUERY], { ssr: false });
  const flags = explorerStore.biasFlags.filter((f) => f.triggered).length;
  const flagText = `${flags} bias ${flags === 1 ? 'flag' : 'flags'}`;
  // Records identified to species: what a load requests (known once the load is planned).
  const speciesLevel = explorerStore.countStory.speciesLevel;

  // Sources that errored while another one still contributes: label the KPIs.
  const enabledIds = (Object.keys(sources) as SourceId[]).filter((id) => explorerStore.query.sources[id]);
  const failed = enabledIds.filter((id) => sources[id].state === 'error');
  const onlyLabel =
    failed.length > 0 && previews.length > 0 ? `${previews.map((p) => SOURCE_NAME[p.source]).join(' + ')} only` : null;

  const bySource = (pick: (p: PreviewSummary) => string): [string, string][] =>
    previews.map((p) => [SOURCE_NAME[p.source], pick(p)]);
  const multi = previews.length > 1;

  // Announce once per settled preview, not on every keystroke.
  const [announcement, setAnnouncement] = useState('');
  const settledText =
    previewState === 'ready' && kpis
      ? `${kpis.recordsUpperBound ? 'Up to ' : ''}${fmtInt(kpis.records)} records, ${
          kpis.species != null ? `${fmtInt(kpis.species)} species, ` : ''
        }${kpis.datasets != null ? `${fmtInt(kpis.datasets)} datasets, ` : ''}years ${yearsText(kpis.yearRange)}.`
      : null;
  useEffect(() => {
    if (settledText) setAnnouncement(settledText);
  }, [settledText]);

  const k: Kpis | null = kpis;
  return (
    <Box data-testid="kpi-strip" aria-busy={loading || first || undefined}>
      <Flex align="flex-start" columnGap={compact ? 5 : 6} minH="52px" wrap="wrap" rowGap={2}>
        <Kpi
          label="Records"
          testId="kpi-records"
          minW="104px"
          loading={loading}
          first={first}
          caption={first ? '' : speciesLevel != null ? `${fmtInt(speciesLevel)} identified to species` : ''}
          value={
            k ? (
              <>
                {k.recordsUpperBound && (
                  <Text as="span" color="fg.muted" fontWeight="normal" mr="1px" aria-label="at most">
                    ≤
                  </Text>
                )}
                {fmtInt(k.records)}
              </>
            ) : (
              '–'
            )
          }
          tip={
            <SplitTip
              title="Records matching every filter"
              rows={[
                ...bySource((p) => fmtInt(p.total)),
                ...(speciesLevel != null ? ([['Identified to species', fmtInt(speciesLevel)]] as [string, string][]) : []),
              ]}
              note={[
                multi ? `Sum over sources, so an upper bound. ${OVERLAP_NOTE}` : null,
                'A load takes the records identified to species and removes duplicates; the decision ledger shows each step.',
              ]
                .filter(Boolean)
                .join(' ')}
            />
          }
        />
        <Kpi
          label="Species"
          testId="kpi-species"
          minW="64px"
          loading={loading}
          first={first}
          value={k?.species != null ? fmtInt(k.species) : '–'}
          tip={
            <SplitTip
              title="Distinct species"
              rows={bySource((p) => (p.species != null ? fmtInt(p.species) : 'unknown'))}
              note={multi ? 'The larger of the source counts; the merged list can hold a few more.' : undefined}
            />
          }
        />
        <Kpi
          label="Datasets"
          testId="kpi-datasets"
          minW="64px"
          loading={loading}
          first={first}
          value={k?.datasets != null ? fmtInt(k.datasets) : '–'}
          tip={
            <SplitTip
              title="Contributing datasets"
              rows={bySource((p) => (p.datasets != null ? fmtInt(p.datasets) : 'unknown'))}
              note={multi ? 'Sum over sources.' : undefined}
            />
          }
        />
        <Kpi
          label="Years"
          testId="kpi-years"
          minW="92px"
          loading={loading}
          first={first}
          value={yearsText(k?.yearRange ?? null)}
          tip={<SplitTip title="Years with records" rows={bySource((p) => yearsText(p.yearRange))} />}
        />

        <HStack gap={2} ml="auto" flexShrink={0} alignSelf="center">
          {baseline ? (
            <Tooltip content="Unpin baseline" disabled={!compact} openDelay={300}>
              <Button
                size="sm"
                variant="outline"
                px={compact ? 2 : undefined}
                onClick={() => explorerStore.clearBaseline()}
                aria-label={compact ? 'Unpin baseline' : undefined}
                data-testid="pin-baseline"
              >
                <LuPinOff />
                {!compact && 'Unpin baseline'}
              </Button>
            </Tooltip>
          ) : (
            <Tooltip
              content={compact ? 'Pin baseline: keep these numbers to compare edits against' : 'Keep these numbers to compare what-if edits against'}
              openDelay={compact ? 200 : 400}
            >
              <Button
                size="sm"
                variant="outline"
                px={compact ? 2 : undefined}
                disabled={!kpis || first}
                onClick={() => explorerStore.pinBaseline()}
                aria-label={compact ? 'Pin baseline' : undefined}
                data-testid="pin-baseline"
              >
                <LuPin />
                {!compact && 'Pin baseline'}
              </Button>
            </Tooltip>
          )}
          {drawer && (
            <Tooltip content={`Insights · ${flagText}`} disabled={!compact} openDelay={200}>
              <Button
                size="sm"
                variant="outline"
                px={compact ? 2 : undefined}
                onClick={() => explorerUi.setInsightsOpen(true)}
                data-testid="insights-toggle"
                aria-label={`Insights, ${flagText}`}
              >
                <LuPanelRight />
                {!compact && 'Insights'}
                {flags > 0 && (
                  <Badge size="sm" colorPalette="orange" variant="solid" fontVariantNumeric="tabular-nums">
                    <Icon as={LuTriangleAlert} boxSize="3" />
                    {flags}
                  </Badge>
                )}
              </Button>
            </Tooltip>
          )}
        </HStack>
      </Flex>

      {/* Second line: reserved height so the caption and baseline chips never shift the map. */}
      <Flex minH="24px" align="center" gap={2} wrap="wrap" rowGap={1} fontSize="xs" color="fg.muted">
        {loading && (
          <HStack gap={1.5} pr={1}>
            <Spinner size="xs" />
            <Text>updating</Text>
          </HStack>
        )}
        {onlyLabel && (
          <Badge size="sm" colorPalette="orange" variant="subtle">
            {onlyLabel}
          </Badge>
        )}
        {baseline && k ? (
          <>
            <Text whiteSpace="nowrap">vs baseline</Text>
            <DeltaChip label="Records" from={baseline.kpis.records} to={k.records} />
            {baseline.kpis.species != null && k.species != null && (
              <DeltaChip label="Species" from={baseline.kpis.species} to={k.species} />
            )}
            {baseline.kpis.datasets != null && k.datasets != null && (
              <DeltaChip label="Datasets" from={baseline.kpis.datasets} to={k.datasets} />
            )}
            <Tooltip content={`Baseline: ${baseline.label}`} openDelay={250}>
              <Text truncate maxW="220px" color="fg.muted" tabIndex={0}>
                {baseline.label}
              </Text>
            </Tooltip>
            <IconButton size="2xs" variant="ghost" aria-label="Unpin baseline" onClick={() => explorerStore.clearBaseline()}>
              <LuX />
            </IconButton>
          </>
        ) : k?.recordsUpperBound ? (
          <Text>
            <Text as="span" fontWeight="semibold">
              ≤
            </Text>{' '}
            {OVERLAP_NOTE}
          </Text>
        ) : null}
      </Flex>

      <VisuallyHidden aria-live="polite" aria-atomic="true">
        {announcement}
      </VisuallyHidden>
    </Box>
  );
});
