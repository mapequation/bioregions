import { Alert, Badge, Box, Button, Collapsible, Flex, HStack, Icon, Skeleton, Stack, Text } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { LuArrowLeftRight, LuChevronRight, LuCircleCheck, LuInfo, LuMap, LuRotateCw } from 'react-icons/lu';
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

function NameList({ title, names }: { title: string; names: string[] }) {
  if (names.length === 0) return null;
  return (
    <Box>
      <Text textStyle="xs" fontWeight="medium" color="fg.muted" px={2.5} pt={1.5} pb={0.5}>
        {title}
      </Text>
      <Box as="ul" listStyleType="none" columns={{ base: 1, xl: 2 }}>
        {names.map((name) => (
          <Box as="li" key={name} px={2.5} py={0.5} textStyle="xs" fontStyle="italic">
            {name}
          </Box>
        ))}
      </Box>
    </Box>
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
  const { selectedId, selection, loadState, loadedTree, selectionReason } = phyloStore;
  const candidate = phyloStore.candidates.find((c) => c.id === selectedId) ?? null;
  if (phyloStore.candidates.length === 0) return null;

  const loading = loadState === 'loading';
  const done = loadState === 'done' && loadedTree != null && loadedTree.candidateId === selectedId;
  const tooFew = selection != null && selection.kept < 2;
  const breakdown = phyloStore.absentBreakdown;

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
            <Collapsible.Root>
              <HStack gap={2} wrap="wrap" rowGap={1} textStyle="sm">
                <Stat value={selection.kept} label="tips kept" />
                <Dot />
                <HStack gap={1}>
                  <Stat value={selection.absentFromTree.length} label="dataset species absent" tone="muted" />
                  {selection.absentFromTree.length > 0 && (
                    <Collapsible.Trigger asChild>
                      <Button size="xs" variant="ghost" px={1.5} h={6} className="group" _expanded={{ bg: 'transparent' }} _hover={{ bg: 'bg.muted' }}>
                        <Icon
                          as={LuChevronRight}
                          transition="transform 0.15s"
                          _groupExpanded={{ transform: 'rotate(90deg)' }}
                        />
                        Show
                      </Button>
                    </Collapsible.Trigger>
                  )}
                </HStack>
                <Dot />
                <Stat value={selection.pruned} label="tree tips pruned" tone="muted" />
              </HStack>
              <Collapsible.Content>
                <Box
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
              </Collapsible.Content>
            </Collapsible.Root>
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
