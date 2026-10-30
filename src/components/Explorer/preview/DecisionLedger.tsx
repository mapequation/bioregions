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

/** Bars under this share of the scale are hidden; the share text still says "<1 %". */
const MIN_BAR_SHARE = 0.005;

/** Fixed rules (not identified to species, duplicates) are steps on the path, not filters. */
const isPathRow = (r: LedgerRow) => r.toggleable === false;

/** Width of the bar column: a fixed scale directly left of the numbers. */
const BAR_W = '160px';
/** Bar and track heights (px): the bar sits on a thinner, faint full-width track. */
const BAR_H = 8;
const TRACK_H = 4;

/** Columns: label · bar · signed count · share · (Δ vs last load). */
const columns = (delta: boolean) =>
  delta ? `minmax(0, 1fr) ${BAR_W} 9ch 6ch 11ch` : `minmax(0, 1fr) ${BAR_W} 9ch 6ch`;

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
  scale: number;
  interactive: 'toggle' | 'readonly' | 'static';
  compare: { total: number } | null;
  /** Why an inactive row cannot be switched on (nothing to restore), or null. */
  blocked: (row: LedgerRow) => string | null;
  onToggle: (row: LedgerRow) => void;
}

function FilterRows({ rows, scale, interactive, compare, blocked, onToggle }: FilterRowsProps) {
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
              variant="muted"
              colorPalette={chartPalettes.removal}
              value={row.active ? (row.impact ?? 0) : 0}
              max={scale}
              height={BAR_H}
              track
              trackHeight={TRACK_H}
              hideBelow={MIN_BAR_SHARE}
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
    </Box>
  );
}

// --- Path to the dataset ----------------------------------------------------------------

export interface PathStep {
  id: string;
  kind: 'total' | 'drop' | 'end';
  label: string;
  /** Records, or null when only known after the load (then `pending` is shown instead). */
  value: number | null;
  pending?: string;
  /** "≤" before the number (sum over overlapping sources). */
  upper?: boolean;
  /** "≈" before the number (an estimate). */
  approx?: boolean;
  tip?: string;
  testId?: string;
}

function PathRows({
  steps,
  scale,
  compare,
}: {
  steps: PathStep[];
  /** Bar scale and the denominator of every share: the first row's records. */
  scale: number;
  /** Leaves room for the Δ column of the filter rows. */
  compare: boolean;
}) {
  const cols = columns(compare);
  return (
    <Box role="list" aria-label="Path to your dataset, in order">
      {steps.map((s, i) => {
        const strong = s.kind !== 'drop';
        const sign =
          s.kind === 'drop' ? (s.value != null && s.value < 0 ? '+ ' : '− ') : i === 0 ? '' : '= ';
        const v = s.value == null ? null : Math.abs(s.value);
        const prefix = s.upper ? '≤ ' : s.approx ? '≈' : '';
        const labelText = (
          <Text as="span" textStyle="sm" fontWeight={strong ? 'semibold' : 'normal'} truncate title={s.label}>
            {sign}
            {s.label}
          </Text>
        );
        return (
          <Grid
            key={s.id}
            role="listitem"
            data-testid={s.testId ?? 'ledger-path-row'}
            data-step={s.id}
            templateColumns={cols}
            alignItems="center"
            columnGap={3}
            minH={7}
            mt={s.kind === 'end' && i > 0 ? 1 : 0}
            borderTopWidth={s.kind === 'end' && i > 0 ? '1px' : 0}
            borderColor="border.muted"
          >
            <HStack gap={1} minW={0} gridColumn={v == null ? '1 / 3' : undefined}>
              {labelText}
              {s.tip && (
                <InfoTip>
                  <Box maxW="260px">{s.tip}</Box>
                </InfoTip>
              )}
            </HStack>
            {v != null && (
              <ShareBar
                variant={s.kind === 'drop' ? 'muted' : 'solid'}
                colorPalette={s.kind === 'drop' ? chartPalettes.removal : chartPalettes.accepted}
                value={v}
                max={scale}
                height={BAR_H}
                track
                trackHeight={TRACK_H}
                hideBelow={MIN_BAR_SHARE}
              />
            )}
            {v == null ? (
              <Text
                as="span"
                textStyle="xs"
                color="fg.muted"
                fontStyle="italic"
                textAlign="right"
                gridColumn="3 / -1"
                whiteSpace="nowrap"
              >
                {s.pending}
              </Text>
            ) : (
              <>
                <Text
                  as="span"
                  textStyle={strong ? 'sm' : 'xs'}
                  fontWeight={strong ? 'semibold' : 'normal'}
                  color={strong || v > 0 ? 'fg' : 'fg.muted'}
                  {...num}
                >
                  {s.kind === 'drop' ? (s.value != null && s.value < 0 ? fmtSigned(v) : fmtSigned(-v)) : `${prefix}${fmtInt(v)}`}
                </Text>
                <Num muted>{fmtPct(v / scale)}</Num>
                {compare && <span />}
              </>
            )}
          </Grid>
        );
      })}
    </Box>
  );
}

/** Column header of the share column, naming its denominator. */
function ShareHeader({ base, compare }: { base: number | null; compare: boolean }) {
  return (
    <Grid templateColumns={columns(compare)} columnGap={3} minH={5} aria-hidden>
      <span />
      <Text
        gridColumn="2 / -1"
        textStyle="xs"
        color="fg.muted"
        textAlign="right"
        truncate
        fontVariantNumeric="tabular-nums"
      >
        {base != null ? `records · % of ${fmtInt(base)} matching taxa and area` : 'records · % of all considered'}
      </Text>
    </Grid>
  );
}

// --- Cleaning section -----------------------------------------------------------------

function CleaningRows({
  steps,
  scale,
  waiting,
  truncated,
  partial,
}: {
  steps: CleaningStep[];
  /** Bar scale shared with the other ledger sections. */
  scale: number;
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
        // The per-source split only helps with several sources.
        const note = s.id === 'received' && !s.note?.includes('·') ? undefined : s.note;
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
              {note && (
                <Text textStyle="xs" color="fg.muted" truncate {...{ fontVariantNumeric: 'tabular-nums' }}>
                  {note}
                </Text>
              )}
              {s.kind === 'end' && partial && (
                <Badge size="sm" colorPalette="orange" variant="subtle">
                  partial
                </Badge>
              )}
            </HStack>
            {waiting ? (
              <Skeleton h={`${BAR_H}px`} />
            ) : (
              <ShareBar
                variant={s.kind === 'drop' ? 'muted' : 'solid'}
                colorPalette={s.kind === 'drop' ? chartPalettes.removal : chartPalettes.accepted}
                value={s.value}
                start={s.start}
                max={scale}
                height={BAR_H}
                track
                trackHeight={TRACK_H}
                hideBelow={MIN_BAR_SHARE}
              />
            )}
            <Num muted={waiting || (s.kind === 'drop' && s.value === 0)}>
              {s.kind === 'drop' ? fmtSigned(-s.value) : fmtInt(s.value)}
            </Num>
            <Num muted>{s.kind === 'drop' && s.value > 0 ? fmtPct(s.value / scale) : ''}</Num>
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
  path,
  steps,
  scale,
  base,
  pathBase,
  caption,
}: {
  rows: LedgerRow[];
  path: PathStep[];
  steps: CleaningStep[] | null;
  scale: number;
  base: number | null;
  /** Denominator of the path shares (its first row). */
  pathBase: number;
  caption: string;
}) {
  const pathValue = (s: PathStep) => {
    if (s.value == null) return s.pending ?? '';
    const v = Math.abs(s.value);
    if (s.kind === 'drop') return fmtSigned(s.value < 0 ? v : -v);
    return `${s.upper ? '≤ ' : s.approx ? '≈' : ''}${fmtInt(v)}`;
  };
  return (
    <Table.Root size="sm" variant="line" css={{ '& td, & th': { fontSize: 'xs' } }}>
      <Table.Caption srOnly>{caption}</Table.Caption>
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeader>Step</Table.ColumnHeader>
          <Table.ColumnHeader>Status</Table.ColumnHeader>
          <Table.ColumnHeader textAlign="end">Records</Table.ColumnHeader>
          <Table.ColumnHeader textAlign="end">
            {base != null ? `% of ${fmtInt(base)} matching taxa and area` : 'Share'}
          </Table.ColumnHeader>
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
          <Table.Cell colSpan={4} fontWeight="semibold" bg="bg.subtle">
            Path to your dataset (% of the first step)
          </Table.Cell>
        </Table.Row>
        {path.map((s) => (
          <Table.Row key={s.id}>
            <Table.Cell fontWeight={s.kind === 'drop' ? undefined : 'semibold'}>{s.label}</Table.Cell>
            <Table.Cell />
            <Table.Cell {...num} fontWeight={s.kind === 'drop' ? undefined : 'semibold'}>
              {pathValue(s)}
            </Table.Cell>
            <Table.Cell {...num}>{s.value != null ? fmtPct(Math.abs(s.value) / pathBase) : ''}</Table.Cell>
          </Table.Row>
        ))}
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
                  {s.kind === 'drop' && s.value > 0 ? fmtPct(s.value / scale) : ''}
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

  const currentRows = ex.ledger;
  const allRows = frozen ? snapshot.ledger : currentRows;
  // Depth only applies to OBIS: hide the row unless it is on or OBIS contributes.
  const obisOn = frozen
    ? (snapshot.funnel.bySource.obis?.received ?? 0) > 0
    : ex.previews.some((p) => p.source === 'obis' && p.total > 0);
  const rows = allRows.filter((r) => !isPathRow(r) && (r.id !== 'depth' || r.active || obisOn));
  // Path rows come from the live store (its query equals the loaded one when frozen).
  const pathRow = (id: string) =>
    currentRows.find((r) => r.id === id) ?? allRows.find((r) => r.id === id) ?? null;

  // Records matching all filters: the preview count (the query is unchanged when frozen).
  const total = ex.ledgerTotal > 0 || !frozen ? ex.ledgerTotal : snapshot.funnel.received || snapshot.kpis.records;
  const totalUpper = ex.kpis?.recordsUpperBound ?? false;
  const state = frozen ? 'ready' : ex.previewState;
  const compare =
    mode === 'preview' && snapshot != null && ex.dirty.size > 0
      ? { total: snapshot.funnel.received || snapshot.kpis.records }
      : null;

  // One scale for every section: the records matching the taxa and area (ledgerBase).
  const base = ex.ledgerBase != null && ex.ledgerBase > 0 ? ex.ledgerBase : null;
  const maxImpact = rows.reduce(
    (m, r) => Math.max(m, r.active ? (r.impact ?? 0) : 0, compare ? (r.loadedImpact ?? 0) : 0),
    0,
  );
  const scale = Math.max(1, total, base ?? total + maxImpact);

  const funnel: Funnel | null =
    mode === 'live' ? (ex.job?.funnel ?? null) : mode === 'frozen' ? (snapshot?.funnel ?? null) : null;
  const minRecordsOn = (query.quality.minRecordsPerSpecies ?? 1) > 1;
  const steps = funnel ? cleaningSteps(funnel, minRecordsOn) : null;

  // --- Path to your dataset, one self-contained chain whose shares are all of its first row:
  // matching taxa and area → filters → matches all filters → species level → duplicates → loaded.
  // No row is shown before the total it is subtracted from.
  const pathBase = base ?? Math.max(1, total);
  const speciesRow = pathRow('speciesLevel');
  const dupRow = pathRow('duplicates');
  const notSpecies = speciesRow?.impact ?? null;
  const speciesLevel = notSpecies != null ? Math.max(0, total - notSpecies) : null;
  // The load estimate also applies the minimum records per species.
  const planned = ex.countStory.speciesLevel;
  const lowCount = speciesLevel != null && planned != null && planned < speciesLevel ? speciesLevel - planned : 0;
  const toLoad = planned ?? speciesLevel;
  const path: PathStep[] = [];
  if (base != null) {
    path.push(
      {
        id: 'base',
        kind: 'total',
        label: 'Matching taxa and area',
        value: base,
        upper: totalUpper,
        tip: 'Records of the chosen taxa in the chosen area, before any quality or scope filter.',
      },
      {
        id: 'filters',
        kind: 'drop',
        label: 'Removed by quality and scope filters',
        value: Math.max(0, base - total),
        tip: 'Records failing at least one of the filters above, each record counted once.',
      },
    );
  }
  path.push(
    {
      id: 'matching',
      kind: base != null ? 'end' : 'total',
      label: 'Matches all filters',
      value: total,
      upper: totalUpper,
      testId: 'ledger-total',
    },
    {
      id: 'speciesLevel',
      kind: 'drop',
      label: speciesRow?.label ?? 'Not identified to species',
      value: notSpecies,
      pending: 'known once the load is planned',
      tip: 'Records identified only to genus or a higher rank cannot be placed in a species, so they are not loaded.',
    },
  );
  if (lowCount > 0) {
    path.push({
      id: 'lowCount',
      kind: 'drop',
      label: 'Species under the minimum records',
      value: lowCount,
      tip: 'Records of species with fewer records than the minimum per species, set under Quality.',
    });
  }
  path.push({
    id: 'toLoad',
    kind: 'end',
    label: 'Species-level records',
    value: toLoad,
    approx: planned == null,
    pending: 'known once the load is planned',
    tip: 'The records a load requests. Duplicates are removed while they arrive.',
  });
  const dupLabel = 'Duplicates (same species, same site)';
  if (frozen) {
    const f = snapshot.funnel;
    const dup = (f.dropped as Partial<Record<string, number>>).duplicate ?? dupRow?.impact ?? 0;
    const cleaned = Math.max(0, f.received - f.accepted - dup);
    const notReceived = toLoad != null ? toLoad - f.received : 0;
    if (notReceived !== 0) {
      path.push({
        id: 'notReceived',
        kind: 'drop',
        label: notReceived > 0 ? 'Not received (cap or source changes)' : 'Received beyond the preview count',
        value: notReceived,
        tip: 'Difference between the preview count and the records the sources returned while loading.',
      });
    }
    path.push({ id: 'duplicates', kind: 'drop', label: dupLabel, value: dup });
    if (cleaned > 0) {
      path.push({
        id: 'cleaning',
        kind: 'drop',
        label: 'Invalid, outside the area or low-count',
        value: cleaned,
        tip: 'Records dropped by the other cleaning steps; the cleaning detail below breaks them down.',
      });
    }
    path.push({ id: 'loaded', kind: 'end', label: snapshot.mode === 'add' ? 'Added' : 'Loaded', value: f.accepted });
  } else {
    path.push(
      {
        id: 'duplicates',
        kind: 'drop',
        label: dupLabel,
        value: dupRow?.impact ?? null,
        pending: mode === 'live' ? 'counting while loading…' : 'counted while loading',
      },
      {
        id: 'loaded',
        kind: 'end',
        label: 'Loaded',
        value: null,
        pending: mode === 'live' ? 'loading…' : 'known after loading',
      },
    );
  }
  const waiting = mode === 'live' && (funnel?.received ?? 0) === 0;
  const truncated = mode !== 'preview' ? (ex.job?.truncated ?? []) : [];

  const interactive = frozen ? 'static' : mode === 'live' ? 'readonly' : 'toggle';
  const showRows = state === 'ready' || state === 'stale' || frozen;
  // After a load the path already shows duplicates and the result; the cleaning detail
  // appears only when it explains more (other drops, records not received, truncation).
  const showCleaning =
    steps != null &&
    funnel != null &&
    (mode === 'live' || truncated.length > 0 || path.some((p) => p.id === 'cleaning' || p.id === 'notReceived'));
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
      path={path}
      steps={steps}
      scale={scale}
      base={base}
      pathBase={pathBase}
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
        <ShareHeader base={base} compare={compare != null} />
        <FilterRows
          rows={rows}
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
        <SectionTitle>Path to your dataset</SectionTitle>
        <PathRows steps={path} scale={pathBase} compare={compare != null} />
        {showCleaning && steps && funnel && (
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
              {frozen ? 'Cleaning detail · in order' : 'Cleaning · in order'}
            </SectionTitle>
            <CleaningRows
              steps={steps}
              scale={scale}
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
              path={path}
              steps={steps}
              scale={scale}
              base={base}
              pathBase={pathBase}
              caption="Decision ledger (table)"
            />
          </VisuallyHidden>
        )}
      </ViewAsTable>
    </Box>
  );
});
