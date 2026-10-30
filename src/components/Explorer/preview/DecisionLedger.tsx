import {
  Badge,
  Box,
  Button,
  Grid,
  HStack,
  Icon,
  Skeleton,
  Spinner,
  Table,
  Text,
  VisuallyHidden,
} from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { type ReactNode, useRef, useState } from 'react';
import { LuCheck, LuDownload, LuMinus } from 'react-icons/lu';
import type { Funnel } from '../../../sources/types';
import { useStore } from '../../../store';
import type { LedgerRow } from '../../../store/explorer/types';
import { Checkbox } from '../../ui/checkbox';
import { InfoTip } from '../../ui/toggle-tip';
import { Tooltip } from '../../ui/tooltip';
import { chartPalettes } from '../charts/colors';
import ShareBar from '../charts/ShareBar';
import ViewAsTable from '../charts/ViewAsTable';
import { fmtInt, fmtPct, fmtSigned } from '../format';
import { type CleaningStep, cleaningSteps } from './cleaningSteps';

export interface DecisionLedgerProps {
  /** preview: filter impact only; live: plus the streaming cleaning funnel; frozen: after a load. */
  mode: 'preview' | 'live' | 'frozen';
}

const FOOTNOTE = "Each bar is what that filter alone removes. Filters overlap, so the bars don't add up.";

/** Columns: label · bar · signed count · share · (Δ vs last load). */
const columns = (delta: boolean) =>
  delta
    ? 'minmax(0, 1.1fr) minmax(64px, 1.5fr) 9ch 5ch 11ch'
    : 'minmax(0, 1.1fr) minmax(64px, 1.5fr) 9ch 5ch';

const num = { fontVariantNumeric: 'tabular-nums', textAlign: 'right', whiteSpace: 'nowrap' } as const;

// --- Pure helpers -------------------------------------------------------------------

function downloadText(text: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function impactText(row: LedgerRow): string {
  if (!row.active) return 'off';
  if (row.impact == null) return 'impact not known yet';
  return `removes ${fmtInt(row.impact)} records (${fmtPct(row.share ?? 0)})`;
}

// --- Small building blocks ----------------------------------------------------------

function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <HStack gap={2} mt={3} mb={1} minH={6}>
      <Text textStyle="xs" fontWeight="semibold" color="fg">
        {children}
      </Text>
      {aside}
    </HStack>
  );
}

function Num({ children, muted, ...rest }: { children: ReactNode; muted?: boolean; 'data-testid'?: string }) {
  return (
    <Text as="span" textStyle="xs" color={muted ? 'fg.muted' : 'fg'} {...num} {...rest}>
      {children}
    </Text>
  );
}

function DeltaCell({ now, before }: { now: number | null; before: number | null | undefined }) {
  if (before == null && now == null) return <span />;
  if (before == null) {
    return (
      <Text as="span" textStyle="xs" color="fg.muted" {...num}>
        new
      </Text>
    );
  }
  // Removals are shown negative, so the delta is (−now) − (−before).
  const d = before - (now ?? 0);
  return (
    <Tooltip content={`At the last load: ${fmtSigned(-before)}`}>
      <Text as="span" textStyle="xs" color={d === 0 ? 'fg.muted' : 'fg.muted'} {...num}>
        Δ {fmtSigned(d)}
      </Text>
    </Tooltip>
  );
}

// --- Filter-impact section ------------------------------------------------------------

interface FilterRowsProps {
  rows: LedgerRow[];
  total: number;
  totalUpper: boolean;
  scale: number;
  interactive: 'toggle' | 'readonly' | 'static';
  compare: { total: number } | null;
  /** Why an inactive row cannot be switched on (nothing to restore), or null. */
  blocked: (row: LedgerRow) => string | null;
  onToggle: (row: LedgerRow) => void;
}

function FilterRows({ rows, total, totalUpper, scale, interactive, compare, blocked, onToggle }: FilterRowsProps) {
  const cols = columns(compare != null);
  return (
    <Box role="list" aria-label="Filter impact, each filter alone">
      {rows.map((row) => {
        const reason = row.active ? null : blocked(row);
        const disabled = reason != null;
        const dim = !row.active;
        const label = (
          <>
            {row.label}
            <VisuallyHidden>, {impactText(row)}</VisuallyHidden>
          </>
        );
        return (
          <Grid
            key={row.id}
            role="listitem"
            data-testid="ledger-row"
            templateColumns={cols}
            alignItems="center"
            columnGap={3}
            minH={7}
            px={1}
            mx={-1}
            rounded="sm"
            _hover={interactive === 'toggle' ? { bg: 'bg.muted' } : undefined}
          >
            <Box minW={0}>
              {interactive === 'static' ? (
                <HStack gap={2} minW={0}>
                  <Icon
                    as={row.active ? LuCheck : LuMinus}
                    boxSize={3.5}
                    color={row.active ? 'fg' : 'fg.muted'}
                    aria-hidden
                  />
                  <Text textStyle="sm" truncate color={dim ? 'fg.muted' : 'fg'} title={row.label}>
                    {label}
                  </Text>
                </HStack>
              ) : (
                <Tooltip
                  content={reason ?? ''}
                  disabled={!disabled}
                  positioning={{ placement: 'top-start' }}
                >
                  <Checkbox
                    size="sm"
                    checked={row.active}
                    disabled={disabled}
                    readOnly={interactive === 'readonly'}
                    onCheckedChange={() => onToggle(row)}
                    maxW="full"
                    css={{ '& [data-part=label]': { minWidth: 0 } }}
                  >
                    <Text as="span" display="block" truncate color={dim ? 'fg.muted' : 'fg'} title={row.label}>
                      {label}
                    </Text>
                  </Checkbox>
                </Tooltip>
              )}
            </Box>
            <ShareBar
              variant="hollow"
              value={row.active ? (row.impact ?? 0) : 0}
              max={scale}
              ghostValue={compare && row.loadedImpact != null ? row.loadedImpact : undefined}
            />
            <Num muted={!row.active || row.impact == null}>
              {row.active && row.impact != null ? fmtSigned(-row.impact) : '–'}
            </Num>
            <Num muted>{row.active && row.share != null ? fmtPct(row.share) : ''}</Num>
            {compare && (row.active ? <DeltaCell now={row.impact} before={row.loadedImpact} /> : <span />)}
          </Grid>
        );
      })}
      <Grid
        templateColumns={cols}
        alignItems="center"
        columnGap={3}
        minH={8}
        mt={1}
        pt={1}
        borderTopWidth="1px"
        borderColor="border.muted"
        data-testid="ledger-total"
      >
        <Text textStyle="sm" fontWeight="semibold">
          = Matches all filters
        </Text>
        <ShareBar variant="solid" colorPalette={chartPalettes.accepted} value={total} max={scale} />
        <Text as="span" textStyle="sm" fontWeight="semibold" {...num}>
          {totalUpper ? '≤ ' : ''}
          {fmtInt(total)}
        </Text>
        <span />
        {compare && <DeltaCell now={-total} before={-compare.total} />}
      </Grid>
    </Box>
  );
}

// --- Cleaning section -----------------------------------------------------------------

function CleaningRows({
  steps,
  received,
  waiting,
  truncated,
  partial,
}: {
  steps: CleaningStep[];
  received: number;
  waiting: boolean;
  truncated: { name: string; kept: number; total: number }[];
  partial: boolean;
}) {
  const [showTruncated, setShowTruncated] = useState(false);
  const cols = columns(false);
  return (
    <Box role="list" aria-label="Cleaning steps, in order">
      {steps.map((s) => {
        const sign = s.kind === 'drop' ? '− ' : s.kind === 'end' ? '= ' : '';
        const bold = s.kind !== 'drop';
        return (
          <Grid
            key={s.id}
            role="listitem"
            data-testid="ledger-row"
            templateColumns={cols}
            alignItems="center"
            columnGap={3}
            minH={7}
            borderTopWidth={s.kind === 'end' ? '1px' : 0}
            borderColor="border.muted"
            mt={s.kind === 'end' ? 1 : 0}
          >
            <HStack gap={2} minW={0}>
              <Text textStyle="sm" fontWeight={bold ? 'semibold' : 'normal'} truncate flexShrink={0} maxW="full">
                {sign}
                {s.label}
              </Text>
              {s.note && (
                <Text textStyle="xs" color="fg.muted" truncate {...{ fontVariantNumeric: 'tabular-nums' }}>
                  {s.note}
                </Text>
              )}
              {s.kind === 'end' && partial && (
                <Badge size="sm" colorPalette="orange" variant="subtle">
                  partial
                </Badge>
              )}
            </HStack>
            {waiting ? (
              <Skeleton h="8px" />
            ) : (
              <ShareBar
                variant="solid"
                colorPalette={s.kind === 'drop' ? chartPalettes.removal : chartPalettes.accepted}
                value={s.value}
                start={s.start}
                max={received}
              />
            )}
            <Num muted={waiting || (s.kind === 'drop' && s.value === 0)}>
              {s.kind === 'drop' ? fmtSigned(-s.value) : fmtInt(s.value)}
            </Num>
            <Num muted>{s.kind === 'drop' && s.value > 0 ? fmtPct(s.value / received) : ''}</Num>
          </Grid>
        );
      })}
      {truncated.length > 0 && (
        <Box role="listitem" mt={1}>
          <HStack gap={2} minH={7}>
            <Text textStyle="sm" color="fg.muted">
              − Truncated: {fmtInt(truncated.length)} species capped (kept{' '}
              {fmtInt(truncated.reduce((s, t) => s + t.kept, 0))} of{' '}
              {fmtInt(truncated.reduce((s, t) => s + t.total, 0))} records)
            </Text>
            <Button
              size="xs"
              variant="plain"
              color="fg.muted"
              textDecoration="underline"
              aria-expanded={showTruncated}
              onClick={() => setShowTruncated((v) => !v)}
            >
              {showTruncated ? 'hide list' : 'list'}
            </Button>
          </HStack>
          {showTruncated && (
            <Box as="ul" pl={4} textStyle="xs" color="fg.muted" maxH="120px" overflowY="auto">
              {truncated.map((t) => (
                <li key={t.name}>
                  <i>{t.name}</i> · {fmtInt(t.kept)} of {fmtInt(t.total)}
                </li>
              ))}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

// --- Table view (visible and visually hidden mirror) ----------------------------------

function LedgerTable({
  rows,
  total,
  totalUpper,
  steps,
  caption,
}: {
  rows: LedgerRow[];
  total: number;
  totalUpper: boolean;
  steps: CleaningStep[] | null;
  caption: string;
}) {
  const received = steps?.[0]?.value ?? 0;
  return (
    <Table.Root size="sm" variant="line" css={{ '& td, & th': { fontSize: 'xs' } }}>
      <Table.Caption srOnly>{caption}</Table.Caption>
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeader>Step</Table.ColumnHeader>
          <Table.ColumnHeader>Status</Table.ColumnHeader>
          <Table.ColumnHeader textAlign="end">Records</Table.ColumnHeader>
          <Table.ColumnHeader textAlign="end">Share</Table.ColumnHeader>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        <Table.Row>
          <Table.Cell colSpan={4} fontWeight="semibold" bg="bg.subtle">
            Filter impact, each alone (overlapping)
          </Table.Cell>
        </Table.Row>
        {rows.map((r) => (
          <Table.Row key={r.id}>
            <Table.Cell>{r.label}</Table.Cell>
            <Table.Cell color="fg.muted">{r.active ? 'on' : 'off'}</Table.Cell>
            <Table.Cell {...num}>{r.active && r.impact != null ? fmtSigned(-r.impact) : '–'}</Table.Cell>
            <Table.Cell {...num}>{r.active && r.share != null ? fmtPct(r.share) : ''}</Table.Cell>
          </Table.Row>
        ))}
        <Table.Row>
          <Table.Cell fontWeight="semibold">Matches all filters</Table.Cell>
          <Table.Cell />
          <Table.Cell {...num} fontWeight="semibold">
            {totalUpper ? '≤ ' : ''}
            {fmtInt(total)}
          </Table.Cell>
          <Table.Cell />
        </Table.Row>
        {steps && (
          <>
            <Table.Row>
              <Table.Cell colSpan={4} fontWeight="semibold" bg="bg.subtle">
                Cleaning, in order
              </Table.Cell>
            </Table.Row>
            {steps.map((s) => (
              <Table.Row key={s.id}>
                <Table.Cell>
                  {s.label}
                  {s.note ? ` (${s.note})` : ''}
                </Table.Cell>
                <Table.Cell />
                <Table.Cell {...num}>{s.kind === 'drop' ? fmtSigned(-s.value) : fmtInt(s.value)}</Table.Cell>
                <Table.Cell {...num}>
                  {s.kind === 'drop' && received > 0 ? fmtPct(s.value / received) : ''}
                </Table.Cell>
              </Table.Row>
            ))}
          </>
        )}
      </Table.Body>
    </Table.Root>
  );
}

function SkeletonRows({ n }: { n: number }) {
  return (
    <Box aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <Grid
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows
          key={i}
          templateColumns={columns(false)}
          alignItems="center"
          columnGap={3}
          minH={7}
        >
          <Skeleton h="12px" w={`${55 + ((i * 17) % 35)}%`} />
          <Skeleton h="8px" w={`${20 + ((i * 29) % 70)}%`} />
          <Skeleton h="12px" />
          <Skeleton h="12px" />
        </Grid>
      ))}
    </Box>
  );
}

// --- The ledger ---------------------------------------------------------------------

/** Decision ledger: what each filter removes (each alone) and the cleaning funnel (in order). */
export default observer(function DecisionLedger({ mode }: DecisionLedgerProps) {
  const { explorerStore: ex } = useStore();
  const [asTable, setAsTable] = useState(false);
  const everExcluded = useRef(false);

  const snapshot = ex.lastLoad;
  const frozen = mode === 'frozen' && snapshot != null;
  const query = frozen ? snapshot.query : ex.query;
  if ((query.quality.excludeDatasets?.length ?? 0) > 0) everExcluded.current = true;

  const allRows = frozen ? snapshot.ledger : ex.ledger;
  // Depth only applies to OBIS: hide the row unless it is on or OBIS contributes.
  const obisOn = frozen
    ? (snapshot.funnel.bySource.obis?.received ?? 0) > 0
    : ex.previews.some((p) => p.source === 'obis' && p.total > 0);
  const rows = allRows.filter((r) => r.id !== 'depth' || r.active || obisOn);
  // After a load, the records that matched all filters are the records received (the
  // snapshot's KPIs count accepted records, after cleaning).
  const total = frozen ? snapshot.funnel.received || snapshot.kpis.records : ex.ledgerTotal;
  const totalUpper = frozen ? false : (ex.kpis?.recordsUpperBound ?? false);
  const state = frozen ? 'ready' : ex.previewState;
  const compare =
    mode === 'preview' && snapshot != null && ex.dirty.size > 0 ? { total: snapshot.funnel.received || snapshot.kpis.records } : null;

  const maxImpact = rows.reduce((m, r) => Math.max(m, r.active ? (r.impact ?? 0) : 0, compare ? (r.loadedImpact ?? 0) : 0), 0);
  const scale = Math.max(1, total + maxImpact);

  const funnel: Funnel | null =
    mode === 'live' ? (ex.job?.funnel ?? null) : mode === 'frozen' ? (snapshot?.funnel ?? null) : null;
  const minRecordsOn = (query.quality.minRecordsPerSpecies ?? 1) > 1;
  const steps = funnel ? cleaningSteps(funnel, minRecordsOn) : null;
  const waiting = mode === 'live' && (funnel?.received ?? 0) === 0;
  const truncated = mode !== 'preview' ? (ex.job?.truncated ?? []) : [];

  const interactive = frozen ? 'static' : mode === 'live' ? 'readonly' : 'toggle';
  const showRows = state === 'ready' || state === 'stale' || frozen;
  const stale = state === 'stale';

  const csv = () => {
    downloadText(ex.ledgerCsv, 'decision-ledger.csv');
  };

  const title = (
    <HStack gap={2}>
      <Text
        as="h3"
        textStyle="xs"
        fontWeight="semibold"
        letterSpacing="wider"
        textTransform="uppercase"
        color="fg.muted"
      >
        Decision ledger
      </Text>
      {stale && (
        <HStack gap={1} color="fg.muted" textStyle="xs" aria-hidden>
          <Spinner size="xs" />
          updating
        </HStack>
      )}
      {frozen && (
        <Badge size="sm" variant="outline">
          as loaded
        </Badge>
      )}
    </HStack>
  );

  const actions = (
    <Button
      size="xs"
      variant="ghost"
      onClick={csv}
      disabled={!showRows}
      aria-label="Download the decision ledger as CSV"
    >
      <LuDownload />
      {frozen ? 'Download ledger CSV' : 'CSV'}
    </Button>
  );

  const table = (
    <LedgerTable
      rows={rows}
      total={total}
      totalUpper={totalUpper}
      steps={steps}
      caption={frozen ? 'Decision ledger at load time' : 'Decision ledger'}
    />
  );

  let body: ReactNode;
  if (state === 'empty') {
    body = (
      <Text textStyle="sm" color="fg.muted" py={3}>
        Add a taxon or narrow the area to a region to see what each filter removes.
      </Text>
    );
  } else if (state === 'error') {
    body = (
      <Text textStyle="sm" color="fg.muted" py={3}>
        No preview to break down. Retry the failed source from its chip in the header.
      </Text>
    );
  } else if (state === 'first') {
    body = (
      <>
        <SectionTitle>Filter impact · each alone (overlapping)</SectionTitle>
        <SkeletonRows n={7} />
      </>
    );
  } else {
    body = (
      <>
        <SectionTitle
          aside={
            mode === 'live' ? (
              <Text textStyle="xs" color="fg.muted">
                frozen at load time
              </Text>
            ) : compare ? (
              <Text textStyle="xs" color="fg.muted">
                dotted ticks: last load
              </Text>
            ) : undefined
          }
        >
          Filter impact · each alone (overlapping)
        </SectionTitle>
        <FilterRows
          rows={rows}
          total={total}
          totalUpper={totalUpper}
          scale={scale}
          interactive={interactive}
          compare={compare}
          blocked={(r) => {
            if (r.id === 'datasets' && !everExcluded.current) return 'Exclude a GBIF dataset under Composition first.';
            // "Years (all)" means there is no earlier year range to restore.
            if (r.id === 'years' && r.label === 'Years (all)') return 'Set a year range in the query column first.';
            return null;
          }}
          onToggle={(r) => ex.toggleFilter(r.id)}
        />
        <HStack gap={1} mt={1} align="center">
          <Text textStyle="xs" color="fg.muted">
            {FOOTNOTE}
          </Text>
          <InfoTip>
            <Box maxW="260px">
              Each count is the records matching the query with only that filter turned off, minus the records
              matching all filters. A record can fail several filters, so it is counted on each of those rows.
            </Box>
          </InfoTip>
        </HStack>
        {steps && funnel && (
          <>
            <SectionTitle
              aside={
                waiting ? (
                  <Text textStyle="xs" color="fg.muted">
                    waiting for the first records…
                  </Text>
                ) : undefined
              }
            >
              Cleaning · in order
            </SectionTitle>
            <CleaningRows
              steps={steps}
              received={Math.max(1, funnel.received)}
              waiting={waiting}
              truncated={truncated}
              partial={frozen && snapshot.partial != null}
            />
          </>
        )}
      </>
    );
  }

  return (
    <Box data-testid="ledger" data-mode={mode} as="section" aria-label="Decision ledger">
      <ViewAsTable
        label="decision ledger"
        title={title}
        actions={actions}
        asTable={asTable}
        onAsTableChange={setAsTable}
        table={table}
      >
        <Box
          aria-busy={stale || undefined}
          opacity={stale ? 0.5 : 1}
          transition="opacity 0.15s"
          _motionReduce={{ transition: 'none' }}
        >
          {body}
        </Box>
        {showRows && (
          <VisuallyHidden>
            <LedgerTable
              rows={rows}
              total={total}
              totalUpper={totalUpper}
              steps={steps}
              caption="Decision ledger (table)"
            />
          </VisuallyHidden>
        )}
      </ViewAsTable>
    </Box>
  );
});
