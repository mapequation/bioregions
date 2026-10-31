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
import { primaryButtonProps, secondaryButtonProps } from '../buttonStyles';
import {
  coverageProgressLabel,
  GRAFEN_NOTE,
  lengthUnits,
  type PhyloCandidate,
} from '../../../store/phylo/candidates';
import { fmtInt } from '../format';

function lengthsNote(c: PhyloCandidate): string {
  if (c.branchLengths === 'none') return GRAFEN_NOTE;
  const units = lengthUnits(c);
  if (c.branchLengths === 'other') {
    return units.short === 'unknown'
      ? 'Branch-length units are not stated in the study; the lengths are used as relative time.'
      : `Branch lengths are in ${units.long} and are used as relative time.`;
  }
  return `Dated tree: branch lengths are in ${units.long} and are used as given.`;
}

/** '31 tips with branch lengths in Myr' / "44 tips, Grafen's arbitrary heights". */
function tipsWithLengths(tips: number, c: PhyloCandidate): string {
  const units = lengthUnits(c);
  const n = `${fmtInt(tips)} ${tips === 1 ? 'tip' : 'tips'}`;
  if (c.branchLengths === 'none') return `${n}, ${units.long}`;
  return units.short === 'unknown' ? `${n}, branch-length units not stated` : `${n} with branch lengths in ${units.long}`;
}

/**
 * What happens to the dataset species the tree lacks when the network is built
 * (InfomapStore.createNetwork): at Tree weight 100 % they get no links at all, below
 * it they keep their occurrence links (weighted 1 − tree weight) but no tree links.
 */
function absentEffect(absent: number, treeWeight: number, synthetic: boolean): string {
  const who = `${fmtInt(absent)} species ${synthetic ? 'not placed in the synthesis' : 'not in this tree'}`;
  const pct = (x: number) => `${Math.round(x * 100)} %`;
  if (treeWeight >= 0.9999) {
    return `At Tree weight ${pct(1)}, the ${who} ${absent === 1 ? 'is' : 'are'} left out of the bioregion network; lower Tree weight in the Infomap settings to keep ${absent === 1 ? 'it' : 'them'} as occurrence-only links.`;
  }
  return `At Tree weight ${pct(treeWeight)}, the ${who} ${absent === 1 ? 'keeps' : 'keep'} only ${absent === 1 ? 'its' : 'their'} occurrence links (weight ${pct(1 - treeWeight)}), without tree links.`;
}

/** Height of the action slot: a two-line sm alert with py 2 (title + description). */
const ACTION_SLOT_H = '52px';

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

/** SELECTED: kept/absent/pruned counts, the branch-length note, the load button and the success panel. */
export default observer(function TreeSelectionSummary() {
  const { explorerStore, phyloStore, infomapStore, dataStore } = useStore();
  const { selectedId, selection, loadState, preselectedDated, selectionNotInData } = phyloStore;
  // The tree slot is the only record of what is loaded (I4).
  const loadedTree = dataStore.tree?.kind === 'opentree' ? dataStore.tree : null;
  // The open name list belongs to one tree: picking another closes it.
  const [open, setOpen] = useState<{ id: string | null; list: 'absent' | 'extra' } | null>(null);
  const openList = open && open.id === selectedId ? open.list : null;
  const toggle = (list: 'absent' | 'extra') => setOpen(openList === list ? null : { id: selectedId, list });
  const candidate = phyloStore.candidates.find((c) => c.id === selectedId) ?? null;
  if (phyloStore.candidates.length === 0) return null;

  const loading = loadState === 'loading';
  const done = loadState === 'done' && loadedTree != null && loadedTree.candidate.id === selectedId;
  const tooFew = selection != null && selection.kept < 2;
  const breakdown = phyloStore.absentBreakdown;
  const awaiting = phyloStore.awaitingBestTree;
  const coverage = phyloStore.coverageProgress;
  const searching = phyloStore.searchingTrees;

  // Trade-off between a dated tree and the synthesis (more tips, topology only).
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
        phyloStore.checkingCoverage ? (
          <Flex align="center" gap={2} minH="72px" textStyle="sm" color="fg.muted" aria-live="polite">
            <Icon as={LuLoaderCircle} animation="spin" animationDuration="1.2s" flexShrink={0} />
            Placing your species on the Open Tree synthesis…
          </Flex>
        ) : (
          <Flex align="center" minH="72px" textStyle="sm" color="fg.muted">
            Pick a tree above to see how many of your species it keeps.
          </Flex>
        )
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
            {preselectedDated && (
              <Badge size="sm" variant="subtle" colorPalette="green" flexShrink={0} alignSelf="center">
                Best dated match
              </Badge>
            )}
          </Flex>

          {selection ? (
            <Box>
              <HStack columnGap={5} rowGap={1} wrap="wrap" textStyle="sm" data-testid="tree-selection-counts">
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
              {selection.absentFromTree.length > 0 && (
                <Text textStyle="xs" color="fg.muted" mt={1} fontVariantNumeric="tabular-nums" data-testid="absent-effect">
                  {absentEffect(selection.absentFromTree.length, infomapStore.treeWeightBalance, candidate.kind === 'synthetic')}
                </Text>
              )}
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
              {preselectedDated &&
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
                {...secondaryButtonProps}
                flexShrink={0}
                onClick={() => phyloStore.select(alternative.target.id)}
                data-testid="tree-alternative"
              >
                Use {alternative.target.kind === 'synthetic' ? 'Open Tree synthesis' : alternative.target.title} instead (
                {fmtInt(alternative.tips)} tips)
              </Button>
            </Flex>
          )}

          {/* One slot for the load button, the success and the error banners: its min height
              fits the two-line banners, so finishing a load does not push the panel up. */}
          <Flex direction="column" justify="center" minH={ACTION_SLOT_H} data-testid="tree-action-slot">
            {done ? (
              <Alert.Root status="success" size="sm" borderRadius="md" alignItems="center" py={2}>
                <Alert.Indicator>
                  <LuCircleCheck />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Title fontVariantNumeric="tabular-nums">
                    Tree loaded with {fmtInt(loadedTree.tips)} tips. Bioregions are updating.
                  </Alert.Title>
                  <Alert.Description>The tree citation is now part of the methods text.</Alert.Description>
                </Alert.Content>
                <Button {...primaryButtonProps} flexShrink={0} onClick={() => explorerStore.setMinimized(true)}>
                  <LuMap /> View bioregions
                </Button>
              </Alert.Root>
            ) : loadState === 'error' ? (
              <Alert.Root status="error" size="sm" borderRadius="md" alignItems="center" py={2}>
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>Couldn't load the tree</Alert.Title>
                  <Alert.Description>Open Tree did not return the tree. Your current data is unchanged.</Alert.Description>
                </Alert.Content>
                <Button {...secondaryButtonProps} flexShrink={0} onClick={() => void phyloStore.loadSelected()}>
                  <LuRotateCw /> Retry
                </Button>
              </Alert.Root>
            ) : awaiting ? (
              <Flex align="center" justify="flex-end" gap={3} wrap="wrap" rowGap={2}>
                <HStack gap={1.5} textStyle="xs" color="fg.muted" fontVariantNumeric="tabular-nums" me="auto" minW={0}>
                  <Icon as={LuLoaderCircle} animation="spin" animationDuration="1.2s" flexShrink={0} />
                  <Text>
                    {searching
                      ? 'Searching Open Tree for published trees'
                      : coverageProgressLabel(coverage)}{' '}
                    · a dated tree may fit better
                  </Text>
                </HStack>
                <Button
                  data-testid="load-tree"
                  {...secondaryButtonProps}
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
                {!tooFew && dataStore.tree && (
                  <Text textStyle="xs" color="fg.muted" truncate>
                    Replaces the tree loaded now.
                  </Text>
                )}
                <Button
                  data-testid="load-tree"
                  {...primaryButtonProps}
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
          </Flex>
        </Stack>
      )}
    </Box>
  );
});
