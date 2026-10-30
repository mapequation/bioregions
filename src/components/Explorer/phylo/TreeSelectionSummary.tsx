import { Alert, Box, Button, Collapsible, Flex, HStack, Icon, Skeleton, Stack, Text } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { LuChevronRight, LuCircleCheck, LuInfo, LuMap, LuRotateCw } from 'react-icons/lu';
import { useStore } from '../../../store';
import type { TreeCandidate } from '../../../store/explorer/types';
import { fmtInt } from '../format';

const GRAFEN_NOTE =
  "Topology only. Branch lengths use Grafen's method (ρ = 1): ages are relative (root = 1), not millions of years.";
const UNDATED_NOTE = 'Branch lengths are in substitutions per site and are used as relative time.';

function lengthsNote(c: TreeCandidate): string {
  if (c.branchLengths === 'none') return GRAFEN_NOTE;
  if (c.branchLengths === 'other') return UNDATED_NOTE;
  return `Dated tree: branch lengths are in ${c.timeUnit ?? 'time units'} and are used as given.`;
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
  const { selectedId, selection, loadState, loadedTree } = phyloStore;
  const candidate = phyloStore.candidates.find((c) => c.id === selectedId) ?? null;
  if (phyloStore.candidates.length === 0) return null;

  const loading = loadState === 'loading';
  const done = loadState === 'done' && loadedTree != null && loadedTree.candidateId === selectedId;
  const tooFew = selection != null && selection.kept < 2;

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
            <Text textStyle="sm" fontWeight="semibold" truncate title={candidate.citation}>
              {candidate.title}
              {candidate.kind === 'synthetic' && candidate.synthVersion
                ? ` v${candidate.synthVersion.replace(/^v/i, '')}`
                : candidate.year != null
                  ? ` (${candidate.year})`
                  : ''}
            </Text>
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
                  as="ul"
                  listStyleType="none"
                  mt={2}
                  maxH="112px"
                  overflowY="auto"
                  borderWidth="1px"
                  borderColor="border.muted"
                  borderRadius="md"
                  bg="bg"
                  py={1}
                  columns={{ base: 1, xl: 2 }}
                >
                  {selection.absentFromTree.map((name) => (
                    <Box as="li" key={name} px={2.5} py={0.5} textStyle="xs" fontStyle="italic">
                      {name}
                    </Box>
                  ))}
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
            <Text>{lengthsNote(candidate)}</Text>
          </HStack>

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
              <Button size="sm" variant="solid" colorPalette="brand" onClick={() => explorerStore.setMinimized(true)}>
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
