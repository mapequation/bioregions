import { Alert, Badge, Box, Button, Flex, HStack, Icon, Skeleton, Stack, Text } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { useState } from 'react';
import {
  LuArrowLeftRight,
  LuChevronRight,
  LuCircleCheck,
  LuInfo,
  LuLoaderCircle,
  LuMap,
  LuRotateCw,
} from 'react-icons/lu';
import { useStore } from '../../../store';
import { GRAFEN_NOTE, lengthUnits, type PhyloCandidate } from '../../../store/phylo/candidates';
import { fmtInt } from '../format';

function lengthsNote(c: PhyloCandidate): string {
  if (c.branchLengths === 'none') return GRAFEN_NOTE;
  const units = lengthUnits(c);
  if (c.branchLengths === 'other') {
    return units.short === 'unknown'
      ? 'Branch lengths are not time (Open Tree records no unit) and are used as relative time.'
      : `Branch lengths are in ${units.long} and are used as relative time.`;
  }
  return `Dated tree: branch lengths are in ${units.long} and are used as given.`;
}

/** '31 tips with branch lengths in Myr' / '44 tips, relative ages (Grafen)'. */
function tipsWithLengths(tips: number, c: PhyloCandidate): string {
  const units = lengthUnits(c);
  const n = `${fmtInt(tips)} ${tips === 1 ? 'tip' : 'tips'}`;
  return c.branchLengths === 'none' ? `${n}, ${units.long}` : `${n} with branch lengths in ${units.long}`;
}

/** Longest name list rendered; the rest is summarised. */
const LIST_MAX = 300;

function NameList({ title, names }: { title: string; names: string[] }) {
  if (names.length === 0) return null;
  const shown = names.slice(0, LIST_MAX);
  return (
    <Box>
      <Text textStyle="xs" fontWeight="medium" color="fg.muted" px={2.5} pt={1.5} pb={0.5}>
        {title}
      </Text>
      <Box as="ul" listStyleType="none" columns={{ base: 1, xl: 2 }}>
        {shown.map((name, i) => (
          // Tree tips can repeat a name.
          // biome-ignore lint/suspicious/noArrayIndexKey: static list
          <Box as="li" key={`${name}-${i}`} px={2.5} py={0.5} textStyle="xs" fontStyle="italic" truncate title={name}>
            {name}
          </Box>
        ))}
      </Box>
      {names.length > LIST_MAX && (
        <Text textStyle="xs" color="fg.muted" px={2.5} py={0.5} fontVariantNumeric="tabular-nums">
          and {fmtInt(names.length - LIST_MAX)} more
        </Text>
      )}
    </Box>
  );
}

/** A small 'Show'/'Hide' disclosure button for a name list. */
function ShowToggle({ open, controls, onToggle, label }: { open: boolean; controls: string; onToggle: () => void; label: string }) {
  return (
    <Button
      size="xs"
      variant="ghost"
      px={1.5}
      h={6}
      aria-expanded={open}
      aria-controls={controls}
      aria-label={`${open ? 'Hide' : 'Show'} ${label}`}
      onClick={onToggle}
      _hover={{ bg: 'bg.muted' }}
    >
      <Icon as={LuChevronRight} transition="transform 0.15s" transform={open ? 'rotate(90deg)' : undefined} />
      {open ? 'Hide' : 'Show'}
    </Button>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: 'muted' }) {
  return (
    <Text as="span" color={tone === 'muted' ? 'fg.muted' : 'fg'}>
      <Text as="span" fontWeight="semibold" fontVariantNumeric="tabular-nums" color="fg">
        {fmtInt(value)}
      </Text>{' '}
      {label}
    </Text>
  );
}

const Dot = () => (
  <Text as="span" color="fg.muted" aria-hidden>
    ·
  </Text>
);

/** SELECTED: kept/absent/pruned counts, the branch-length note, the load button and the success panel. */
export default observer(function TreeSelectionSummary() {
  const { explorerStore, phyloStore } = useStore();
  const { selectedId, selection, loadState, loadedTree, selectionReason, selectionNotInData } = phyloStore;
  // The open name list belongs to one tree: picking another closes it.
  const [open, setOpen] = useState<{ id: string | null; list: 'absent' | 'extra' } | null>(null);
  const openList = open && open.id === selectedId ? open.list : null;
  const toggle = (list: 'absent' | 'extra') => setOpen(openList === list ? null : { id: selectedId, list });
  const candidate = phyloStore.candidates.find((c) => c.id === selectedId) ?? null;
  if (phyloStore.candidates.length === 0) return null;

  const loading = loadState === 'loading';
  const done = loadState === 'done' && loadedTree != null && loadedTree.candidateId === selectedId;
  const tooFew = selection != null && selection.kept < 2;
  const breakdown = phyloStore.absentBreakdown;
  const awaiting = phyloStore.awaitingBestTree;
  const coverage = phyloStore.coverageProgress;

  // Trade-off between a dated tree and the synthesis (more tips, relative ages only).
  const synthetic = phyloStore.syntheticTree;
  const syntheticTips = synthetic?.coverageState === 'ready' ? (synthetic.coverage?.matched ?? null) : null;
  const best = phyloStore.bestDated;
  const alternative: { target: PhyloCandidate; tips: number } | null =
    candidate?.kind === 'study' && synthetic && syntheticTips != null && syntheticTips >= 2
      ? { target: synthetic, tips: syntheticTips }
      : candidate?.kind === 'synthetic' && best?.coverage
        ? { target: best, tips: best.coverage.matched }
        : null;

  return (
    <Box
      data-testid="tree-selection"
      flexShrink={0}
      borderTopWidth="1px"
      borderColor="border"
      bg="bg.subtle"
      px={4}
      py={3}
      maxH="45%"
      overflowY="auto"
    >
      {!candidate ? (
        <Flex align="center" minH="72px" textStyle="sm" color="fg.muted">
          Pick a tree above to see how many of your species it keeps.
        </Flex>
      ) : (
        <Stack gap={2.5}>
          <Flex align="baseline" gap={2} minW={0}>
            <Text
              textStyle="xs"
              fontWeight="semibold"
              letterSpacing="wider"
              textTransform="uppercase"
              color="fg.muted"
              flexShrink={0}
            >
              Selected
            </Text>
            <Text textStyle="sm" fontWeight="semibold" truncate title={candidate.citation} flexShrink={1} minW={0}>
              {candidate.title}
              {candidate.kind === 'synthetic' && candidate.synthVersion
                ? ` ${candidate.synthVersion}`
                : ''}
              {candidate.kind === 'study' && candidate.subtitle && (
                <Text as="span" fontWeight="normal" color="fg.muted" textStyle="xs">
                  {' '}
                  · {candidate.subtitle}
                </Text>
              )}
            </Text>
            {selectionReason === 'dated' && (
              <Badge size="sm" variant="subtle" colorPalette="green" flexShrink={0} alignSelf="center">
                Best dated match
              </Badge>
            )}
          </Flex>

          {selection ? (
            <Box>
              <HStack gap={2} wrap="wrap" rowGap={1} textStyle="sm" data-testid="tree-selection-counts">
                {candidate.kind === 'synthetic' ? (
                  <Text as="span">
                    Induced subtree of your{' '}
                    <Text as="span" fontWeight="semibold" fontVariantNumeric="tabular-nums">
                      {fmtInt(selection.kept)}
                    </Text>{' '}
                    placed species
                  </Text>
                ) : (
                  <Stat value={selection.kept} label="of your species in this tree" />
                )}
                <Dot />
                <HStack gap={1}>
                  <Stat
                    value={selection.absentFromTree.length}
                    label={candidate.kind === 'synthetic' ? 'not placed' : 'absent'}
                    tone="muted"
                  />
                  {selection.absentFromTree.length > 0 && (
                    <ShowToggle
                      open={openList === 'absent'}
                      controls="phylo-absent-list"
                      label="your species missing from this tree"
                      onToggle={() => toggle('absent')}
                    />
                  )}
                </HStack>
                <Dot />
                <HStack gap={1}>
                  <Stat
                    value={selection.pruned}
                    label={
                      candidate.kind === 'synthetic'
                        ? selection.pruned === 1
                          ? 'extra tip'
                          : 'extra tips'
                        : `tree ${selection.pruned === 1 ? 'tip' : 'tips'} not in your data`
                    }
                    tone="muted"
                  />
                  {selection.pruned > 0 && selectionNotInData && selectionNotInData.length > 0 && (
                    <ShowToggle
                      open={openList === 'extra'}
                      controls="phylo-extra-list"
                      label="tree tips not in your data"
                      onToggle={() => toggle('extra')}
                    />
                  )}
                </HStack>
              </HStack>
              {openList === 'absent' && (
                <Box
                  id="phylo-absent-list"
                  mt={2}
                  maxH="132px"
                  overflowY="auto"
                  borderWidth="1px"
                  borderColor="border.muted"
                  borderRadius="md"
                  bg="bg"
                  pb={1}
                >
                  {breakdown && (
                    <Text
                      textStyle="xs"
                      color="fg"
                      px={2.5}
                      pt={1.5}
                      fontVariantNumeric="tabular-nums"
                      data-testid="absent-breakdown"
                    >
                      {fmtInt(selection.absentFromTree.length)} absent: {fmtInt(breakdown.unmatched.length)}{' '}
                      {breakdown.unmatched.length === 1 ? 'unmatched name' : 'unmatched names'},{' '}
                      {fmtInt(breakdown.notInTree.length)} not in this tree
                    </Text>
                  )}
                  <NameList
                    title="Unmatched names (not found in Open Tree)"
                    names={breakdown?.unmatched ?? selection.absentFromTree}
                  />
                  <NameList title="Matched, but not in this tree" names={breakdown?.notInTree ?? []} />
                </Box>
              )}
              {openList === 'extra' && selectionNotInData && (
                <Box
                  id="phylo-extra-list"
                  mt={2}
                  maxH="132px"
                  overflowY="auto"
                  borderWidth="1px"
                  borderColor="border.muted"
                  borderRadius="md"
                  bg="bg"
                  pb={1}
                >
                  <NameList
                    title="Tree tips not in your data (dropped on load)"
                    names={selectionNotInData}
                  />
                </Box>
              )}
            </Box>
          ) : (
            <Flex align="center" h="20px" aria-busy>
              <Skeleton h="3" w="60%" />
            </Flex>
          )}

          <HStack gap={2} align="flex-start" textStyle="xs" color="fg.muted">
            <Icon as={LuInfo} mt="2px" flexShrink={0} />
            <Text>
              {selectionReason === 'dated' &&
                'Pre-selected as the dated tree with the best coverage (at least 60 % of your species). '}
              {lengthsNote(candidate)}
            </Text>
          </HStack>

          {alternative && selection && (
            <Flex
              align="center"
              gap={3}
              wrap="wrap"
              rowGap={1.5}
              px={3}
              py={2}
              borderWidth="1px"
              borderColor="border.muted"
              borderRadius="md"
              bg="bg"
              data-testid="tree-tradeoff"
            >
              <Icon as={LuArrowLeftRight} color="fg.muted" flexShrink={0} />
              <Text textStyle="xs" flex="1" minW="240px" fontVariantNumeric="tabular-nums">
                <Text as="span" fontWeight="semibold">
                  This tree:
                </Text>{' '}
                {tipsWithLengths(selection.kept, candidate)}.{' '}
                <Text as="span" fontWeight="semibold">
                  {alternative.target.kind === 'synthetic' ? 'Open Tree synthesis' : alternative.target.title}:
                </Text>{' '}
                {tipsWithLengths(alternative.tips, alternative.target)}.
              </Text>
              <Button
                size="xs"
                variant="outline"
                flexShrink={0}
                onClick={() => phyloStore.select(alternative.target.id)}
                data-testid="tree-alternative"
              >
                Use {alternative.target.kind === 'synthetic' ? 'Open Tree synthesis' : alternative.target.title} instead (
                {fmtInt(alternative.tips)} tips)
              </Button>
            </Flex>
          )}

          {done ? (
            <Alert.Root status="success" size="sm" borderRadius="md" alignItems="center">
              <Alert.Indicator>
                <LuCircleCheck />
              </Alert.Indicator>
              <Alert.Content>
                <Alert.Title fontVariantNumeric="tabular-nums">
                  Tree loaded with {fmtInt(loadedTree.tips)} tips. Bioregions are updating.
                </Alert.Title>
                <Alert.Description>The tree citation is now part of the methods text.</Alert.Description>
              </Alert.Content>
              <Button size="sm" variant="solid" colorPalette="gray" flexShrink={0} onClick={() => explorerStore.setMinimized(true)}>
                <LuMap /> View bioregions
              </Button>
            </Alert.Root>
          ) : loadState === 'error' ? (
            <Alert.Root status="error" size="sm" borderRadius="md" alignItems="center">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>Couldn't load the tree</Alert.Title>
                <Alert.Description>Open Tree did not return the tree. Your current data is unchanged.</Alert.Description>
              </Alert.Content>
              <Button size="sm" variant="outline" onClick={() => void phyloStore.loadSelected()}>
                <LuRotateCw /> Retry
              </Button>
            </Alert.Root>
          ) : awaiting ? (
            <Flex align="center" justify="flex-end" gap={3} wrap="wrap" rowGap={2}>
              <HStack gap={1.5} textStyle="xs" color="fg.muted" fontVariantNumeric="tabular-nums" me="auto" minW={0}>
                <Icon as={LuLoaderCircle} animation="spin" animationDuration="1.2s" flexShrink={0} />
                <Text>
                  Checking coverage {fmtInt(coverage.done)}/{fmtInt(coverage.total)} · a dated tree may fit better
                </Text>
              </HStack>
              <Button
                data-testid="load-tree"
                size="sm"
                variant="outline"
                loading={loading}
                loadingText="Loading tree…"
                disabled={selection == null || tooFew}
                onClick={() => void phyloStore.loadSelected()}
              >
                {candidate.kind === 'synthetic' ? 'Load synthesis now (topology only)' : `Load ${candidate.title} now`}
              </Button>
            </Flex>
          ) : (
            <Flex align="center" justify="flex-end" gap={3}>
              {tooFew && (
                <Text textStyle="xs" color="fg.muted" id="load-tree-reason">
                  This tree keeps fewer than 2 of your species.
                </Text>
              )}
              {!tooFew && loadedTree && (
                <Text textStyle="xs" color="fg.muted" truncate>
                  Replaces the tree loaded now.
                </Text>
              )}
              <Button
                data-testid="load-tree"
                size="sm"
                loading={loading}
                loadingText="Loading tree…"
                disabled={selection == null || tooFew}
                aria-describedby={tooFew ? 'load-tree-reason' : undefined}
                onClick={() => void phyloStore.loadSelected()}
              >
                Load tree &amp; re-run bioregions
              </Button>
            </Flex>
          )}
        </Stack>
      )}
    </Box>
  );
});
