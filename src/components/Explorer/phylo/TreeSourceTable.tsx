import {
  Alert,
  Box,
  Button,
  chakra,
  Flex,
  HStack,
  Icon,
  Link,
  NativeSelect,
  RadioGroup,
  Skeleton,
  Stack,
  Table,
  Text,
} from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { useState } from 'react';
import { LuCheck, LuChevronRight, LuExternalLink, LuLoaderCircle, LuRotateCw, LuSearchX } from 'react-icons/lu';
import { Switch } from '@/components/ui/switch';
import { Tooltip } from '@/components/ui/tooltip';
import { useStore } from '../../../store';
import type { TreeCandidate } from '../../../store/explorer/types';
import { groupByStudy, lengthUnits, type PhyloCandidate } from '../../../store/phylo/candidates';
import ShareBar from '../charts/ShareBar';
import { fmtInt, fmtPct } from '../format';

const OTOL_HOME = 'https://tree.opentreeoflife.org/';

function doiUrl(doi: string): string {
  return /^https?:\/\//.test(doi) ? doi : `https://doi.org/${doi.replace(/^doi:\s*/i, '')}`;
}

/** Branch lengths come from study metadata until the tree itself has been read. */
function unverified(c: TreeCandidate): boolean {
  return c.kind === 'study' && c.coverageState !== 'ready';
}

const UNVERIFIED_TIP = 'From the study record; confirmed once the tree is read.';

/** A muted '?' after a value that is not confirmed yet. */
const Unsure = () => (
  <Text as="span" color="fg.subtle" ms={0.5} aria-hidden>
    ?
  </Text>
);

function CoverageCell({ c, onRetry }: { c: PhyloCandidate; onRetry: (id: string) => void }) {
  if (c.coverageState === 'pending') {
    return (
      <HStack gap={1.5} color="fg.muted" textStyle="xs">
        <Icon as={LuLoaderCircle} animation="spin" animationDuration="1.2s" />
        <Text>checking…</Text>
      </HStack>
    );
  }
  if (c.coverageState === 'error' || !c.coverage) {
    const timedOut = c.coverageError === 'timeout';
    return (
      <HStack gap={1} textStyle="xs" color="fg.muted" minW={0}>
        <Tooltip
          content={
            timedOut
              ? 'Open Tree took longer than 20 s to send this tree.'
              : "Couldn't download this tree to count its tips."
          }
          showArrow
        >
          <Text as="span" tabIndex={0} whiteSpace="nowrap">
            {timedOut ? 'timed out' : 'failed'}
          </Text>
        </Tooltip>
        <Text as="span" aria-hidden>
          ·
        </Text>
        <Button
          size="2xs"
          variant="plain"
          px={0}
          h="auto"
          minW={0}
          color="fg"
          textDecoration="underline"
          textUnderlineOffset="2px"
          aria-label={`Retry coverage check for ${c.title}`}
          onClick={(e) => {
            e.stopPropagation();
            onRetry(c.id);
          }}
        >
          retry
        </Button>
      </HStack>
    );
  }
  const { matched, total } = c.coverage;
  return (
    <Stack gap={1} pe={2}>
      <Text textStyle="xs" fontVariantNumeric="tabular-nums" lineHeight="1">
        <Text as="span" fontWeight="semibold">
          {fmtInt(matched)}
        </Text>
        <Text as="span" color="fg.muted">
          /{fmtInt(total)}
        </Text>
      </Text>
      <Box bg="bg.muted" borderRadius="1px">
        <ShareBar
          value={matched}
          max={total}
          height={5}
          label={`${fmtInt(matched)} of ${fmtInt(total)} species (${fmtPct(total > 0 ? matched / total : 0)})`}
        />
      </Box>
    </Stack>
  );
}

/** Short branch-length unit for the table, '–' when the study does not state one. */
function unitLabel(c: PhyloCandidate): string {
  const units = lengthUnits(c);
  return units.short === 'unknown' ? '–' : units.short;
}

function LengthsCell({ c }: { c: PhyloCandidate }) {
  const units = lengthUnits(c);
  const unsure = unverified(c);
  const known =
    c.branchLengths === 'none'
      ? 'No branch lengths: Grafen lengths (relative ages, root = 1) are added on load.'
      : c.branchLengths === 'time'
        ? c.timeUnit
          ? `Time-calibrated; branch lengths in ${units.long}.`
          : 'Time-calibrated; Open Tree records no unit, so millions of years is assumed.'
        : units.short === 'unknown'
          ? 'Branch-length units not stated in the study; they are used as relative time.'
          : `Branch lengths in ${units.long}, used as relative time.`;
  const tip = unsure ? `${known} ${UNVERIFIED_TIP}` : known;
  return (
    <Tooltip content={tip} showArrow openDelay={300} contentProps={{ maxW: '280px' }}>
      <Text
        as="span"
        display="block"
        truncate
        tabIndex={0}
        color={unsure ? 'fg.muted' : c.branchLengths === 'time' ? 'fg' : 'fg.muted'}
        aria-label={units.short === 'unknown' ? 'units not stated' : undefined}
      >
        {unitLabel(c)}
        {unsure && <Unsure />}
      </Text>
    </Tooltip>
  );
}

/** A tree's label (up to two lines), with the full curator label and tree id in a tooltip. */
function Subtitle({ c, text }: { c: PhyloCandidate; text: string }) {
  return (
    <Tooltip content={c.subtitleDetail ?? text} showArrow openDelay={400} contentProps={{ maxW: '360px' }}>
      <Text lineClamp={2} textStyle="xs" lineHeight="1rem" color="fg.muted" wordBreak="break-word">
        {text}
      </Text>
    </Tooltip>
  );
}

/**
 * Source cell: 'Springer et al. 2012', the shown tree's label below it and, for a
 * study with several trees, a '7 trees' disclosure that lists the others.
 */
function SourceCell({
  c,
  selected,
  trees = 1,
  expanded,
  onToggle,
  controls,
}: {
  c: PhyloCandidate;
  selected: boolean;
  trees?: number;
  expanded?: boolean;
  onToggle?: () => void;
  controls?: string;
}) {
  const toggle =
    trees > 1 &&
    (onToggle ? (
      <chakra.button
        type="button"
        data-testid="tree-group-toggle"
        display="inline-flex"
        alignItems="center"
        gap={0.5}
        flexShrink={0}
        ps={0.5}
        pe={1.5}
        h={4}
        borderRadius="sm"
        textStyle="xs"
        lineHeight="1rem"
        fontWeight="medium"
        color="fg"
        fontVariantNumeric="tabular-nums"
        whiteSpace="nowrap"
        cursor="pointer"
        _hover={{ bg: 'bg.muted' }}
        focusVisibleRing="outside"
        aria-expanded={expanded}
        aria-controls={controls}
        aria-label={`${fmtInt(trees)} trees of ${c.title}: ${expanded ? 'hide' : 'show'} the other ${fmtInt(trees - 1)}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <Icon
          as={LuChevronRight}
          boxSize={3.5}
          transition="transform 0.15s"
          transform={expanded ? 'rotate(90deg)' : undefined}
        />
        {fmtInt(trees)} trees
      </chakra.button>
    ) : (
      <Text as="span" textStyle="xs" lineHeight="1rem" color="fg.muted" flexShrink={0} fontVariantNumeric="tabular-nums">
        {fmtInt(trees)} trees
      </Text>
    ));
  return (
    <Stack gap={0} minW={0}>
      <Tooltip content={c.citation || c.title} showArrow openDelay={400} contentProps={{ maxW: '360px' }}>
        <Text truncate textStyle="sm" lineHeight="1.25rem" fontWeight={selected ? 'semibold' : 'medium'}>
          {c.title}
        </Text>
      </Tooltip>
      {toggle ? (
        <Flex align="flex-start" gap={2} minW={0}>
          {toggle}
          {c.subtitle && (
            <Box minW={0} flex="1">
              <Subtitle c={c} text={c.subtitle} />
            </Box>
          )}
        </Flex>
      ) : c.subtitle ? (
        <Subtitle c={c} text={c.subtitle} />
      ) : (
        <Box h="1rem" aria-hidden />
      )}
    </Stack>
  );
}

/** '412 tips · Myr' for a study's other trees, so trees with similar labels can be told apart. */
function treeFacts(c: PhyloCandidate): string {
  const parts: string[] = [];
  if (c.tipCount != null) parts.push(`${fmtInt(c.tipCount)} ${c.tipCount === 1 ? 'tip' : 'tips'}`);
  const unit = lengthUnits(c).short;
  parts.push(unit === 'unknown' ? 'units not stated' : unit === 'Grafen' ? 'no branch lengths' : unit);
  return parts.join(' · ');
}

/** One of a study's other trees, in the expanded group: its label and how it differs. */
function AlternativeCell({ c, selected }: { c: PhyloCandidate; selected: boolean }) {
  // The cleaned label ('tree 2 of 7' when the curator gave none); the full one is in the tooltip.
  const label = c.subtitle ?? c.treeId ?? c.id;
  return (
    <Stack gap={0} minW={0} ps={3} borderLeftWidth="2px" borderColor="border.emphasized">
      <Tooltip content={c.subtitleDetail ?? label} showArrow openDelay={400} contentProps={{ maxW: '360px' }}>
        <Text
          lineClamp={2}
          textStyle="xs"
          lineHeight="1rem"
          fontWeight={selected ? 'semibold' : 'medium'}
          color="fg"
          wordBreak="break-word"
        >
          {label}
        </Text>
      </Tooltip>
      <Text textStyle="xs" lineHeight="1rem" color="fg.muted" fontVariantNumeric="tabular-nums" truncate>
        {treeFacts(c)}
      </Text>
    </Stack>
  );
}

function DatedCell({ c }: { c: TreeCandidate }) {
  const dated = c.branchLengths === 'time';
  if (unverified(c)) {
    return (
      <Tooltip content={`${dated ? 'Dated' : 'Not dated'} per the study record; confirmed once the tree is read.`} showArrow openDelay={300}>
        <Text as="span" display="inline-flex" alignItems="center" color="fg.muted" tabIndex={0} aria-label={dated ? 'dated (unconfirmed)' : 'not dated (unconfirmed)'}>
          {dated ? <Icon as={LuCheck} /> : '–'}
          <Unsure />
        </Text>
      </Tooltip>
    );
  }
  return dated ? (
    <Icon as={LuCheck} color="fg" aria-label="dated" role="img" />
  ) : (
    <Text as="span" color="fg.muted" aria-label="not dated">
      –
    </Text>
  );
}

function DoiCell({ c }: { c: TreeCandidate }) {
  return c.doi ? (
    <Link
      href={doiUrl(c.doi)}
      target="_blank"
      rel="noreferrer"
      aria-label={`DOI of ${c.title} (opens in a new tab)`}
      color="fg.muted"
      _hover={{ color: 'fg' }}
      onClick={(e) => e.stopPropagation()}
    >
      <LuExternalLink />
    </Link>
  ) : (
    <Text as="span" color="fg.muted">
      –
    </Text>
  );
}

const ROW_H = '52px';
const ALT_ROW_H = '44px';
const COLS = 6;

const SKELETON_ROWS = [0, 1, 2, 3];

/** TREES FOR <clade>: candidate trees with radio-row selection, sort and Dated only. */
export default observer(function TreeSourceTable() {
  const { phyloStore } = useStore();
  const { clade, candidates, candidatesState, sort, datedOnly, selectedId, matchProgress } = phyloStore;
  const rows = phyloStore.visibleCandidates;
  const groups = phyloStore.rowGroups;
  const noOverlap = phyloStore.noOverlapCandidates;
  const noOverlapGroups = groupByStudy(noOverlap, null, true);
  const [showNoOverlap, setShowNoOverlap] = useState(false);
  // Expanded study groups, by study id.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const toggleGroup = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const checking = phyloStore.checkingCoverage;
  const searching = phyloStore.searchingTrees;
  const sources = new Set(candidates.map((c) => c.studyId ?? c.id)).size;
  const progress = phyloStore.coverageProgress;
  const waiting = matchProgress != null || (candidatesState === 'loading' && candidates.length === 0);
  const retry = (id: string) => void phyloStore.retryCoverage(id);
  const select = (id: string) => {
    if (id !== phyloStore.selectedId) phyloStore.select(id);
  };

  let body: React.ReactNode;
  if (candidatesState === 'error') {
    body = (
      <Alert.Root status="error" size="sm" borderRadius="md">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Couldn't search Open Tree for trees</Alert.Title>
          <Alert.Description>The Open Tree service did not answer. Your matches are kept.</Alert.Description>
        </Alert.Content>
        <Button size="xs" variant="outline" alignSelf="center" onClick={() => void phyloStore.matchNames()}>
          <LuRotateCw /> Retry
        </Button>
      </Alert.Root>
    );
  } else if (!waiting && candidatesState === 'ready' && candidates.length === 0) {
    body = (
      <Flex direction="column" align="center" textAlign="center" gap={2} py={10} px={6} color="fg.muted">
        <Icon as={LuSearchX} boxSize={6} />
        <Text textStyle="sm" fontWeight="medium" color="fg">
          No trees found{clade ? ` for ${clade.name}` : ''}
        </Text>
        <Text textStyle="xs" maxW="420px">
          Open Tree has no synthesis subtree or published study that covers these species. You can browse the taxonomy
          and studies at{' '}
          <Link href={OTOL_HOME} target="_blank" rel="noreferrer" color="fg" textDecoration="underline">
            tree.opentreeoflife.org <LuExternalLink />
          </Link>
          .
        </Text>
      </Flex>
    );
  } else if (!waiting && rows.length === 0 && noOverlap.length === 0 && candidates.length > 0) {
    body = (
      <Flex direction="column" align="center" textAlign="center" gap={2} py={10} px={6}>
        <Text textStyle="sm" fontWeight="medium">
          No dated trees for {clade?.name ?? 'this clade'}
        </Text>
        <Text textStyle="xs" color="fg.muted">
          {fmtInt(candidates.length)} {candidates.length === 1 ? 'tree has' : 'trees have'} no time-calibrated branch
          lengths.
        </Text>
        <Button size="xs" variant="outline" onClick={() => phyloStore.setDatedOnly(false)}>
          Show all trees
        </Button>
      </Flex>
    );
  } else {
    body = (
      <RadioGroup.Root
        size="sm"
        value={selectedId}
        onValueChange={(e) => e.value && select(e.value)}
        aria-label="Tree to load"
      >
        <Box borderWidth="1px" borderColor="border" borderRadius="md" overflow="hidden">
          <Table.Root size="sm" tableLayout="fixed" w="full" aria-busy={waiting || checking || undefined}>
            <Table.ColumnGroup>
              <Table.Column htmlWidth="36px" />
              <Table.Column />
              <Table.Column htmlWidth="120px" />
              <Table.Column htmlWidth="60px" />
              <Table.Column htmlWidth="100px" />
              <Table.Column htmlWidth="48px" />
            </Table.ColumnGroup>
            <Table.Header>
              <Table.Row bg="bg.subtle">
                <Table.ColumnHeader>
                  <Box srOnly>Select</Box>
                </Table.ColumnHeader>
                <Table.ColumnHeader>Source</Table.ColumnHeader>
                <Table.ColumnHeader>Coverage</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="center">Dated</Table.ColumnHeader>
                <Table.ColumnHeader>Lengths</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="center">DOI</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {waiting
                ? SKELETON_ROWS.map((i) => (
                    <Table.Row key={i} h={ROW_H}>
                      <Table.Cell>
                        <Skeleton boxSize="14px" borderRadius="full" />
                      </Table.Cell>
                      <Table.Cell>
                        <Stack gap={1.5}>
                          <Skeleton h="3" w={`${80 - i * 12}%`} />
                          <Skeleton h="2.5" w={`${50 - i * 8}%`} />
                        </Stack>
                      </Table.Cell>
                      <Table.Cell>
                        <Skeleton h="3" w="70%" />
                      </Table.Cell>
                      <Table.Cell>
                        <Skeleton h="3" w="50%" mx="auto" />
                      </Table.Cell>
                      <Table.Cell>
                        <Skeleton h="3" w="60%" />
                      </Table.Cell>
                      <Table.Cell />
                    </Table.Row>
                  ))
                : groups.flatMap(({ key, lead: c, others }) => {
                    const selected = c.id === selectedId;
                    const open = others.length > 0 && expanded.has(key);
                    const altId = (i: number) => `phylo-alt-${key}-${i}`;
                    const leadRow = (
                      <Table.Row
                        key={key}
                        data-testid="tree-row"
                        data-selected={selected || undefined}
                        aria-selected={selected}
                        h={ROW_H}
                        cursor="pointer"
                        bg={selected ? 'colorPalette.subtle' : undefined}
                        _hover={{ bg: selected ? 'colorPalette.subtle' : 'bg.subtle' }}
                        onClick={() => select(c.id)}
                      >
                        <Table.Cell>
                          <RadioGroup.Item value={c.id} display="flex">
                            <RadioGroup.ItemHiddenInput aria-label={c.subtitle ? `${c.title}, ${c.subtitle}` : c.title} />
                            <RadioGroup.ItemIndicator />
                          </RadioGroup.Item>
                        </Table.Cell>
                        <Table.Cell>
                          <SourceCell
                            c={c}
                            selected={selected}
                            trees={others.length + 1}
                            expanded={open}
                            onToggle={() => toggleGroup(key)}
                            controls={others.map((_, i) => altId(i)).join(' ')}
                          />
                        </Table.Cell>
                        <Table.Cell>
                          <CoverageCell c={c} onRetry={retry} />
                        </Table.Cell>
                        <Table.Cell textAlign="center">
                          <DatedCell c={c} />
                        </Table.Cell>
                        <Table.Cell>
                          <LengthsCell c={c} />
                        </Table.Cell>
                        <Table.Cell textAlign="center">
                          <DoiCell c={c} />
                        </Table.Cell>
                      </Table.Row>
                    );
                    if (!open) return [leadRow];
                    return [
                      leadRow,
                      ...others.map((alt, i) => {
                        const altSelected = alt.id === selectedId;
                        return (
                          <Table.Row
                            key={alt.id}
                            id={altId(i)}
                            data-testid="tree-row-alt"
                            data-selected={altSelected || undefined}
                            aria-selected={altSelected}
                            h={ALT_ROW_H}
                            cursor="pointer"
                            bg="bg.subtle"
                            _hover={{ bg: 'bg.muted' }}
                            onClick={() => select(alt.id)}
                          >
                            <Table.Cell>
                              <RadioGroup.Item value={alt.id} display="flex">
                                <RadioGroup.ItemHiddenInput
                                  aria-label={`${alt.title}, ${alt.fullLabel ?? alt.subtitle ?? alt.id}`}
                                />
                                <RadioGroup.ItemIndicator />
                              </RadioGroup.Item>
                            </Table.Cell>
                            <Table.Cell>
                              <AlternativeCell c={alt} selected={altSelected} />
                            </Table.Cell>
                            <Table.Cell>
                              <CoverageCell c={alt} onRetry={retry} />
                            </Table.Cell>
                            <Table.Cell textAlign="center">
                              <DatedCell c={alt} />
                            </Table.Cell>
                            <Table.Cell>
                              <LengthsCell c={alt} />
                            </Table.Cell>
                            <Table.Cell />
                          </Table.Row>
                        );
                      }),
                    ];
                  })}
              {!waiting &&
                searching &&
                SKELETON_ROWS.slice(0, 3).map((i) => (
                  <Table.Row key={`searching-${i}`} h={ROW_H} aria-hidden>
                    <Table.Cell>
                      <Skeleton boxSize="14px" borderRadius="full" />
                    </Table.Cell>
                    <Table.Cell>
                      <Stack gap={1.5}>
                        <Skeleton h="3" w={`${70 - i * 12}%`} />
                        <Skeleton h="2.5" w={`${45 - i * 8}%`} />
                      </Stack>
                    </Table.Cell>
                    <Table.Cell>
                      <Skeleton h="3" w="70%" />
                    </Table.Cell>
                    <Table.Cell>
                      <Skeleton h="3" w="50%" mx="auto" />
                    </Table.Cell>
                    <Table.Cell>
                      <Skeleton h="3" w="60%" />
                    </Table.Cell>
                    <Table.Cell />
                  </Table.Row>
                ))}
              {!waiting && noOverlap.length > 0 && (
                <Table.Row bg="bg.subtle" _hover={{ bg: 'bg.muted' }}>
                  <Table.Cell colSpan={COLS} p={0}>
                    <chakra.button
                      type="button"
                      display="flex"
                      alignItems="center"
                      gap={2}
                      w="full"
                      px={3}
                      py={2}
                      textStyle="xs"
                      color="fg.muted"
                      textAlign="start"
                      cursor="pointer"
                      aria-expanded={showNoOverlap}
                      aria-controls="phylo-no-overlap"
                      onClick={() => setShowNoOverlap((v) => !v)}
                      focusVisibleRing="inside"
                    >
                      <Icon
                        as={LuChevronRight}
                        transition="transform 0.15s"
                        transform={showNoOverlap ? 'rotate(90deg)' : undefined}
                      />
                      <Text as="span" fontWeight="medium" color="fg">
                        No overlap with your species
                      </Text>
                      <Text as="span" fontVariantNumeric="tabular-nums">
                        ({fmtInt(noOverlapGroups.length)})
                      </Text>
                      <Text as="span" ms="auto" truncate>
                        These trees contain none of your species and can't be loaded.
                      </Text>
                    </chakra.button>
                  </Table.Cell>
                </Table.Row>
              )}
              {!waiting &&
                showNoOverlap &&
                noOverlapGroups.map(({ key, lead: c, others }) => (
                  <Table.Row
                    key={key}
                    data-testid="tree-row-no-overlap"
                    h={ROW_H}
                    color="fg.muted"
                    aria-disabled
                  >
                    <Table.Cell />
                    <Table.Cell>
                      <SourceCell c={c} selected={false} trees={others.length + 1} />
                    </Table.Cell>
                    <Table.Cell>
                      <CoverageCell c={c} onRetry={retry} />
                    </Table.Cell>
                    <Table.Cell textAlign="center">
                      <DatedCell c={c} />
                    </Table.Cell>
                    <Table.Cell>
                      <LengthsCell c={c} />
                    </Table.Cell>
                    <Table.Cell textAlign="center">
                      <DoiCell c={c} />
                    </Table.Cell>
                  </Table.Row>
                ))}
            </Table.Body>
          </Table.Root>
        </Box>
      </RadioGroup.Root>
    );
  }

  return (
    <Stack flex="1" minH={0} gap={3} p={4} overflowY="auto">
      <Flex align="center" gap={3} wrap="wrap" rowGap={2} minH="32px">
        <Text
          as="h3"
          textStyle="xs"
          fontWeight="semibold"
          letterSpacing="wider"
          textTransform="uppercase"
          color="fg.muted"
          truncate
          flex="1"
          minW={0}
        >
          Trees for{' '}
          {clade ? (
            <Text as="span" textTransform="none" letterSpacing="normal" textStyle="sm" color="fg">
              {clade.name}
            </Text>
          ) : (
            <Text as="span" textTransform="none" letterSpacing="normal" fontWeight="normal">
              {waiting ? 'your clade, once names are matched' : 'your clade'}
            </Text>
          )}
          {candidates.length > 0 && !checking && (
            <Text as="span" textTransform="none" letterSpacing="normal" fontWeight="normal" fontVariantNumeric="tabular-nums">
              {' '}
              · {fmtInt(candidates.length)} {candidates.length === 1 ? 'tree' : 'trees'}
              {sources < candidates.length && ` from ${fmtInt(sources)} sources`}
            </Text>
          )}
        </Text>
        {checking && (
          <HStack
            gap={1.5}
            textStyle="xs"
            color="fg.muted"
            fontVariantNumeric="tabular-nums"
            flexShrink={0}
            data-testid="phylo-coverage-progress"
          >
            <Icon as={LuLoaderCircle} animation="spin" animationDuration="1.2s" />
            {searching ? (
              <Text as="span">Searching for trees…</Text>
            ) : (
              <>
                <Text as="span" hideBelow="xl">
                  Checking coverage of {fmtInt(progress.total)} {progress.total === 1 ? 'tree' : 'trees'}…{' '}
                  {fmtInt(progress.done)}/{fmtInt(progress.total)}
                </Text>
                <Text as="span" hideFrom="xl">
                  Checking coverage {fmtInt(progress.done)}/{fmtInt(progress.total)}
                </Text>
              </>
            )}
          </HStack>
        )}
        <HStack gap={2}>
          <chakra.label htmlFor="phylo-sort" textStyle="xs" color="fg.muted">
            Sort
          </chakra.label>
          <NativeSelect.Root size="sm" w="124px" disabled={candidates.length === 0}>
            <NativeSelect.Field
              id="phylo-sort"
              value={sort}
              onChange={(e) => phyloStore.setSort(e.currentTarget.value as 'coverage' | 'year')}
            >
              <option value="coverage">Coverage</option>
              <option value="year">Year</option>
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
        </HStack>
        <Switch
          size="sm"
          checked={datedOnly}
          onCheckedChange={(e) => phyloStore.setDatedOnly(e.checked)}
          disabled={candidates.length === 0}
        >
          <Text as="span" textStyle="xs">
            Dated only
          </Text>
        </Switch>
      </Flex>
      {body}
      {!waiting && rows.length > 0 && (
        <Text textStyle="xs" color="fg.muted">
          {searching
            ? 'The synthesis can be loaded now; published trees are listed as Open Tree finds them.'
            : checking
            ? 'Rows keep their order while coverage is checked, then sort once.'
            : groups.some((g) => g.others.length > 0)
              ? "Coverage counts your species among each tree's tips. A study with several trees shows its best-covered one; expand it to pick another."
              : "Coverage counts your species among each tree's tips. Hover a source for its citation."}
        </Text>
      )}
    </Stack>
  );
});
