import {
  Box,
  Button,
  Heading,
  HStack,
  IconButton,
  SegmentGroup,
  Text,
} from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { useState } from 'react';
import { LuInfo } from 'react-icons/lu';
import type { ReactNode } from 'react';
import type { Bioregion } from '@/store/InfomapStore';
import {
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from '../ui/popover';
import { DistributionStrip } from './DistributionStrip';
import { format } from 'd3-format';
import { formatInt, formatShare, plural } from './format';
import { useStore } from '@/store';

// Three lists side by side from this card width; below it, a segmented control picks one.
const WIDE = '940px';

// Rows appended under a heavier rule for searched species that are not among the top rows.
const MAX_EXTRA_ROWS = 10;

// Fixed column widths (the name takes the rest), identical with or without pinned search rows.
const METRIC_WIDTH = 48;
const STRIP_COLUMN_WIDTH = 40;
const STRIP_WIDTH = 34;

// Below this fidelity a characteristic species is widespread: most of its records lie elsewhere.
const WIDESPREAD = 0.5;

// One stylesheet for the whole table so rows stay plain <tr>/<td> elements (cheap to mount).
const tableCss = {
  width: '100%',
  tableLayout: 'fixed',
  borderCollapse: 'collapse',
  fontSize: '13px',
  fontVariantNumeric: 'tabular-nums',
  '& th': {
    fontSize: '11px',
    fontWeight: 500,
    color: 'fg.muted',
    textAlign: 'left',
    height: '24px',
    px: '1.5',
    whiteSpace: 'nowrap',
    borderBottomWidth: '1px',
    borderColor: 'border',
  },
  // Right-aligned header labels may overflow leftwards into the name column's header.
  '& th.num > span': {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '2px',
    whiteSpace: 'nowrap',
  },
  '& th[aria-sort]': { color: 'fg' },
  // "Records" barely fits a 48px column: no left padding keeps it clear of the label before it,
  // while the right edge stays aligned with the numbers. "Regions" may run into the card padding.
  '& th.num': { pl: 0 },
  // Every cell is one line, so rows are 28px and share a baseline across the three tables; long
  // names end in an ellipsis (the full name is in the cell's title).
  '& td': {
    height: '28px',
    px: '1.5',
    verticalAlign: 'middle',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  '& td.name': { fontStyle: 'italic' },
  // Side by side, long binomials show an abbreviated genus so the epithet stays readable.
  '& .abbr': { display: 'none' },
  [`@container (min-width: ${WIDE})`]: {
    '& .full': { display: 'none' },
    '& .abbr': { display: 'inline' },
  },
  // Narrow metric and strip columns get tighter padding than the name column.
  // Numbers are never cut off: columns are sized for their longest value.
  '& .num': { textAlign: 'right', px: '1' },
  '& td.num': { overflow: 'visible', textOverflow: 'clip' },
  '& .strip': { px: '1' },
  '& tr + tr td': { borderTopWidth: '1px', borderColor: 'border.muted' },
  '& tr[data-first-extra] td': {
    borderTopWidth: '2px',
    borderColor: 'border.emphasized',
  },
  '& tr[data-widespread] td.name': { color: 'fg.muted' },
  '& .rank': { fontStyle: 'normal', color: 'fg.muted' },
  '& tr[data-match] td': { bg: 'yellow.subtle' },
} as const;

// Binomials longer than this get the conventional abbreviated genus ("O. longicaudatus") in the
// side-by-side layout, where a species column fits about this many characters; the full name
// is in the cell's title.
const MAX_NAME_LENGTH = 22;

function abbreviated(name: string): string | null {
  if (name.length <= MAX_NAME_LENGTH) return null;
  const [genus, ...rest] = name.split(' ');
  return rest.length > 0 ? `${genus[0]}. ${rest.join(' ')}` : null;
}

type Row = {
  name: string;
  values: [string, string];
  title?: string;
  // 1-based rank in the full list, shown for pinned search rows.
  rank?: number;
  // Mutes the name of a species with most of its records in other bioregions.
  widespread?: boolean;
};

// `secondary`: the column breaks ties of the sort key, marked with a muted arrow.
type Column = {
  label: string;
  title?: string;
  width?: number;
  secondary?: boolean;
};

function SpeciesRows({
  label,
  columns,
  rows,
  extra,
  bioregionId,
  highlight,
  tooltips,
}: {
  label: string;
  // The first column is the list's sort key.
  columns: [Column, Column];
  rows: Row[];
  extra: Row[];
  bioregionId: number;
  highlight: ReadonlySet<string> | null;
  tooltips: boolean;
}) {
  const renderRow = (row: Row, firstExtra = false) => (
    <tr
      key={row.name}
      title={row.title}
      data-match={highlight?.has(row.name) ? '' : undefined}
      data-first-extra={firstExtra ? '' : undefined}
      data-widespread={row.widespread ? '' : undefined}
    >
      <td className="name" title={row.name}>
        <span>
          {row.rank !== undefined && <span className="rank">#{row.rank} </span>}
          {abbreviated(row.name) ? (
            <>
              <span className="full">{row.name}</span>
              <span className="abbr">{abbreviated(row.name)}</span>
            </>
          ) : (
            row.name
          )}
        </span>
      </td>
      <td className="num">{row.values[0]}</td>
      <td className="num">{row.values[1]}</td>
      <td className="strip">
        <DistributionStrip
          speciesName={row.name}
          bioregionId={bioregionId}
          tooltip={tooltips}
          width={STRIP_WIDTH}
        />
      </td>
    </tr>
  );

  return (
    <Box as="table" css={tableCss} aria-label={label}>
      <thead>
        <tr>
          <th scope="col">Species</th>
          <th
            scope="col"
            className="num"
            aria-sort="descending"
            title={columns[0].title}
            style={{ width: columns[0].width ?? METRIC_WIDTH }}
          >
            <span>
              {columns[0].label}
              <span aria-hidden>↓</span>
            </span>
          </th>
          <th
            scope="col"
            className="num"
            title={columns[1].title}
            // Room between the primary sort label and a secondary-sort arrow.
            style={{
              width: columns[1].width ?? METRIC_WIDTH,
              paddingInlineStart: columns[1].secondary ? 8 : undefined,
            }}
          >
            <span>
              {columns[1].label}
              {columns[1].secondary && (
                <Box as="span" aria-hidden color="fg.muted">
                  ↓
                </Box>
              )}
            </span>
          </th>
          <th
            scope="col"
            className="strip"
            title="Share of the species' records in each bioregion (color = bioregion, this one first)"
            style={{ width: STRIP_COLUMN_WIDTH }}
          >
            Regions
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => renderRow(row))}
        {extra.map((row, i) => renderRow(row, i === 0))}
      </tbody>
    </Box>
  );
}

/** Indices of searched species in `all` that are not among the first `numRows`. */
function extraIndices(
  all: { name: string }[],
  numRows: number,
  highlight: ReadonlySet<string> | null,
): number[] {
  if (!highlight || highlight.size === 0) return [];
  const extra: number[] = [];
  for (let i = numRows; i < all.length && extra.length < MAX_EXTRA_ROWS; ++i) {
    if (highlight.has(all[i].name)) extra.push(i);
  }
  return extra;
}

/** Top `numRows` rows plus pinned search rows (with their rank) from one sorted list. */
function listRows<T extends { name: string }>(
  all: T[],
  numRows: number,
  highlight: ReadonlySet<string> | null,
  toRow: (item: T) => Row,
) {
  return {
    rows: all.slice(0, numRows).map(toRow),
    extra: extraIndices(all, numRows, highlight).map((i) => ({
      ...toRow(all[i]),
      rank: i + 1,
    })),
  };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
// Single species hold small shares of a bioregion's flow, so keep two significant digits.
const formatFlowShare = format('.2p');
// Record counts fit the narrow metric columns up to 9,999; abbreviate above ("12.3k").
const formatCountSi = format('.3~s');
const formatCount = (n: number) => (n < 1e4 ? formatInt(n) : formatCountSi(n));

/** Share of the bioregion's centrality with two significant digits (12%, 3.5%, 0.44%), the
 *  precision the members are ranked at (see Bioregion.calcStats). */
const formatCentralityShare = format('.2p');

/** IndVal as a percentage, but never round a non-zero value down to "0%". */
function formatIndVal(indVal: number) {
  const value = indVal * 100;
  return value > 0 && value < 0.5 ? '<1%' : `${Math.round(value)}%`;
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <PopoverRoot lazyMount unmountOnExit positioning={{ placement: 'top' }}>
      <PopoverTrigger asChild>
        <IconButton
          aria-label={label}
          variant="ghost"
          size="2xs"
          color="fg.muted"
          flexShrink={0}
        >
          <LuInfo />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent>
        <PopoverArrow />
        <PopoverBody fontSize="sm">
          {children}
          <Text mt="2">
            <strong>Regions</strong> bar: how the species' records split across
            bioregions, this one first.
          </Text>
        </PopoverBody>
      </PopoverContent>
    </PopoverRoot>
  );
}

const CharacteristicInfo = () => (
  <Info label="About characteristic species">
    Species that Infomap clustered into this bioregion together with its grid
    cells, ranked by <strong>map equation centrality</strong> (Blöcker, Nieves
    &amp; Rosvall 2022): how much a species anchors the bioregion's flow-based
    description, shown as the species' share of the bioregion's total
    centrality. Species found in nearly every cell of a large bioregion have
    near-equal shares; equal values are ordered by fidelity, then flow.{' '}
    <strong>Fidelity</strong>: how concentrated the species is here, its mean
    records per grid cell in this bioregion relative to the sum over all
    bioregions (the IndVal specificity), so large bioregions don't win on area
    alone. Core members (fidelity ≥50%) are listed by default; widespread
    members can be shown, with muted names.
  </Info>
);

const IndValInfo = () => (
  <Info label="About indicator species">
    <strong>Indicator value</strong> (IndVal, 0–100%) = specificity × occupancy.{' '}
    <strong>Specificity</strong>: the species' mean records per grid cell in
    this bioregion, relative to the sum of its means across all bioregions.{' '}
    <strong>Occupancy</strong>: share of the bioregion's grid cells with a
    record of the species. Records-based variant of Dufrêne &amp; Legendre
    (1997).
  </Info>
);

const CommonInfo = () => (
  <Info label="About most common species">
    Species with the most records in this bioregion. <strong>Share</strong>: the
    species' share of the bioregion's records.
  </Info>
);

type ListKey = 'characteristic' | 'indicator' | 'common';

const LIST_ITEMS: { value: ListKey; label: string }[] = [
  { value: 'characteristic', label: 'Characteristic' },
  { value: 'indicator', label: 'Indicator' },
  { value: 'common', label: 'Most common' },
];

/** Characteristic (Infomap), indicator (IndVal) and most common species of a bioregion. */
export const SpeciesTables = observer(function SpeciesTables({
  bioregion,
  numRows,
  highlight,
  tooltips,
}: {
  bioregion: Bioregion;
  numRows: number;
  highlight: ReadonlySet<string> | null;
  tooltips: boolean;
}) {
  const { speciesStore, settingsStore } = useStore();
  const [active, setActive] = useState<ListKey>('characteristic');
  const { members, characteristic, mostCommon, numRecords, bioregionId } =
    bioregion;
  const records = new Map(mostCommon.map((s) => [s.name, s.count]));
  const flowShare = (flow: number) =>
    bioregion.flow > 0 ? formatFlowShare(flow / bioregion.flow) : '–';

  const toMemberRow = (s: Bioregion['members'][number]): Row => {
    const widespread = s.fidelity < WIDESPREAD;
    return {
      name: s.name,
      values: [formatCentralityShare(s.mec / totalMec), pct(s.fidelity)],
      widespread,
      title: [
        `Map equation centrality ${s.mec.toExponential(1)}`,
        `${flowShare(s.flow)} of the bioregion's flow`,
        `fidelity ${pct(s.fidelity)}${widespread ? ' (widespread)' : ''}`,
        `${pct(s.share)} of its records are here`,
        plural(records.get(s.name) ?? 0, 'record'),
      ].join(' · '),
    };
  };
  const toIndicatorRow = (s: Bioregion['characteristic'][number]): Row => ({
    name: s.name,
    values: [formatIndVal(s.indVal), formatCount(s.count)],
    title: `${plural(s.count, 'record')} · specificity ${pct(s.specificity)} · occupancy ${pct(s.occupancy)}`,
  });
  const toCommonRow = (s: Bioregion['mostCommon'][number]): Row => ({
    name: s.name,
    values: [
      formatCount(s.count),
      numRecords > 0 ? formatShare(s.count / numRecords) : '–',
    ],
    title:
      numRecords > 0
        ? `${plural(s.count, 'record')} · ${formatShare(s.count / numRecords)} of the bioregion's records`
        : undefined,
  });

  // Widespread members are hidden unless the (global) setting shows them; centrality order is kept.
  const showWidespread = settingsStore.showWidespreadMembers;
  const numWidespread = members.filter((m) => m.fidelity < WIDESPREAD).length;
  const listed = showWidespread
    ? members
    : members.filter((m) => m.fidelity >= WIDESPREAD);
  // Centrality is shown as a share of all members' centrality, hidden ones included.
  const totalMec = members.reduce((sum, m) => sum + m.mec, 0) || 1;

  // Members found in nearly every cell tie at the displayed precision; the list then says so and
  // marks fidelity as the tie-breaker.
  const top = listed
    .slice(0, numRows)
    .map((m) => formatCentralityShare(m.mec / totalMec));
  const tied = top.length >= 3 && top[2] === top[0];

  // A single searched species that is not listed: say where Infomap clustered it, or that it is
  // a hidden widespread member here.
  const [single] = highlight?.size === 1 ? highlight : [];
  const singleMember =
    single !== undefined ? members.find((m) => m.name === single) : undefined;
  const clusteredInto =
    single !== undefined && !singleMember
      ? speciesStore.speciesMap.get(single)?.bioregionId
      : undefined;
  const singleHidden =
    singleMember !== undefined && !listed.includes(singleMember);

  const widespreadToggle =
    numWidespread > 0 ? (
      <Text
        fontSize="12px"
        lineHeight="16px"
        color="fg.muted"
        whiteSpace="nowrap"
      >
        {!showWidespread && `${formatInt(numWidespread)} widespread hidden · `}
        {/* The setting is global: it applies to every bioregion's list. */}
        <Button
          variant="plain"
          size="xs"
          h="auto"
          minW={0}
          p={0}
          fontSize="inherit"
          fontWeight={500}
          color="fg"
          textDecoration="underline"
          textUnderlineOffset="2px"
          verticalAlign="baseline"
          title={`${showWidespread ? 'Hide' : 'Show'} members with less than 50% of their records here, in every bioregion`}
          onClick={() =>
            settingsStore.setShowWidespreadMembers(!showWidespread)
          }
        >
          {showWidespread ? 'Hide widespread' : 'Show'}
        </Button>
      </Text>
    ) : null;

  const lists = [
    {
      key: 'characteristic' as const,
      title: 'Characteristic species',
      subtitle: 'Co-clustered by Infomap · by centrality',
      info: <CharacteristicInfo />,
      toggle: widespreadToggle,
      columns: [
        {
          label: 'Centrality',
          title: "Share of the bioregion's total map equation centrality",
          width: 60,
        },
        {
          label: 'Fidelity',
          title:
            'How concentrated the species is here: mean records per grid cell in this bioregion relative to the sum over all bioregions',
          secondary: tied,
          width: tied ? 58 : undefined,
        },
      ] as [Column, Column],
      ...listRows(listed, numRows, highlight, toMemberRow),
      empty:
        members.length > 0
          ? 'All species clustered into this bioregion are widespread.'
          : 'No species clustered into this bioregion.',
      note:
        tied && numRows > 0 && !highlight ? (
          <>
            Equal centrality (found in nearly every cell): ordered by fidelity
          </>
        ) : clusteredInto !== undefined ? (
          <>
            <i>{single}</i> is clustered into Bioregion {clusteredInto}
          </>
        ) : singleHidden ? (
          <>
            <i>{single}</i> is a widespread member here (hidden)
          </>
        ) : null,
    },
    {
      key: 'indicator' as const,
      title: 'Indicator species',
      subtitle: 'IndVal = specificity × occupancy',
      info: <IndValInfo />,
      toggle: null,
      columns: [{ label: 'IndVal' }, { label: 'Records' }] as [Column, Column],
      ...listRows(characteristic, numRows, highlight, toIndicatorRow),
      empty: 'No species records in this bioregion.',
      note: null,
    },
    {
      key: 'common' as const,
      title: 'Most common',
      subtitle: 'By number of records',
      info: <CommonInfo />,
      toggle: null,
      columns: [
        { label: 'Records' },
        { label: 'Share', title: "Share of this bioregion's records" },
      ] as [Column, Column],
      ...listRows(mostCommon, numRows, highlight, toCommonRow),
      empty: 'No species records in this bioregion.',
      note: null,
    },
  ];

  return (
    <Box css={{ containerType: 'inline-size' }}>
      <SegmentGroup.Root
        size="xs"
        mb="2"
        aria-label="Species list"
        value={active}
        onValueChange={(e) => setActive(e.value as ListKey)}
        css={{ [`@container (min-width: ${WIDE})`]: { display: 'none' } }}
      >
        <SegmentGroup.Indicator />
        <SegmentGroup.Items items={LIST_ITEMS} />
      </SegmentGroup.Root>
      <Box
        display="grid"
        gridTemplateColumns="minmax(0, 1fr)"
        columnGap="6"
        css={{
          '& > [data-inactive]': { display: 'none' },
          // The segment label names the list in narrow mode.
          '& .list-title': { display: 'none' },
          // Side by side, the lists share rows (subgrid) so subtitles and tables line up.
          [`@container (min-width: ${WIDE})`]: {
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            '& > [data-list]': {
              display: 'grid',
              gridRow: 'span 3',
              gridTemplateRows: 'subgrid',
            },
            '& .list-title': { display: 'block' },
          },
        }}
      >
        {lists.map((list) => (
          <Box
            key={list.key}
            minW={0}
            data-list=""
            data-inactive={list.key === active ? undefined : ''}
          >
            <Heading
              as="h4"
              className="list-title"
              fontSize="sm"
              fontWeight={600}
              lineHeight="20px"
            >
              {list.title}
            </Heading>
            {/* Side by side, this subgrid row is as tall as the tallest list's, so the widespread
                toggle under one subtitle keeps all three tables aligned. */}
            <Box mb="1">
              <HStack gap="1" minH="6">
                <Text
                  fontSize="12px"
                  lineHeight="16px"
                  color="fg.muted"
                  truncate
                  title={list.subtitle}
                >
                  {list.subtitle}
                </Text>
                {list.info}
              </HStack>
              {list.toggle}
            </Box>
            <Box minW={0}>
              {list.rows.length > 0 ? (
                <SpeciesRows
                  label={`${list.title} of bioregion ${bioregionId}`}
                  columns={list.columns}
                  rows={list.rows}
                  extra={list.extra}
                  bioregionId={bioregionId}
                  highlight={highlight}
                  tooltips={tooltips}
                />
              ) : (
                <Text fontSize="sm" color="fg.muted">
                  {list.empty}
                </Text>
              )}
              {list.note && (
                <Text fontSize="12px" color="fg.muted" mt="1.5" px="1.5">
                  {list.note}
                </Text>
              )}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
});
