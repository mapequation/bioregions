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
import { LuCheck, LuExternalLink, LuLoaderCircle, LuRotateCw, LuSearchX } from 'react-icons/lu';
import { Switch } from '@/components/ui/switch';
import { Tooltip } from '@/components/ui/tooltip';
import { useStore } from '../../../store';
import type { TreeCandidate } from '../../../store/explorer/types';
import ShareBar from '../charts/ShareBar';
import { fmtInt, fmtPct } from '../format';

const OTOL_HOME = 'https://tree.opentreeoflife.org/';

function doiUrl(doi: string): string {
  return /^https?:\/\//.test(doi) ? doi : `https://doi.org/${doi.replace(/^doi:\s*/i, '')}`;
}

/** Year column: the synthesis version for the synthetic tree, else the study year. */
function yearLabel(c: TreeCandidate): string {
  if (c.kind === 'synthetic') return c.synthVersion ? `v${c.synthVersion.replace(/^v/i, '')}` : '–';
  return c.year != null ? String(c.year) : '–';
}

function CoverageCell({ c }: { c: TreeCandidate }) {
  if (c.coverageState === 'pending') {
    return (
      <HStack gap={1.5} color="fg.muted" textStyle="xs">
        <Icon as={LuLoaderCircle} animation="spin" animationDuration="1.2s" />
        <Text>checking…</Text>
      </HStack>
    );
  }
  if (c.coverageState === 'error' || !c.coverage) {
    return (
      <Tooltip content="Couldn't download this tree to count its tips." showArrow>
        <Text as="span" color="fg.muted" textStyle="xs" tabIndex={0}>
          unknown
        </Text>
      </Tooltip>
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

function LengthsCell({ c }: { c: TreeCandidate }) {
  if (c.branchLengths === 'none') {
    return (
      <Tooltip content="No branch lengths; Grafen lengths (relative ages) are added on load." showArrow>
        <Text as="span" color="fg.muted" tabIndex={0}>
          Grafen
        </Text>
      </Tooltip>
    );
  }
  if (c.branchLengths === 'time') return <Text as="span">time</Text>;
  return (
    <Tooltip content="Branch lengths that are not time, e.g. substitutions per site." showArrow>
      <Text as="span" tabIndex={0}>
        other
      </Text>
    </Tooltip>
  );
}

const SKELETON_ROWS = [0, 1, 2, 3];

/** TREES FOR <clade>: candidate trees with radio-row selection, sort and Dated only. */
export default observer(function TreeSourceTable() {
  const { phyloStore } = useStore();
  const { clade, candidates, candidatesState, sort, datedOnly, selectedId, matchProgress } = phyloStore;
  const rows = phyloStore.visibleCandidates;
  const waiting = matchProgress != null || (candidatesState === 'loading' && candidates.length === 0);
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
  } else if (!waiting && rows.length === 0 && candidates.length > 0) {
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
          <Table.Root size="sm" tableLayout="fixed" w="full" aria-busy={waiting || undefined}>
            <Table.ColumnGroup>
              <Table.Column htmlWidth="36px" />
              <Table.Column />
              <Table.Column htmlWidth="128px" />
              <Table.Column htmlWidth="64px" />
              <Table.Column htmlWidth="72px" />
              <Table.Column htmlWidth="72px" />
              <Table.Column htmlWidth="52px" />
            </Table.ColumnGroup>
            <Table.Header>
              <Table.Row bg="bg.subtle">
                <Table.ColumnHeader>
                  <Box srOnly>Select</Box>
                </Table.ColumnHeader>
                <Table.ColumnHeader>Source</Table.ColumnHeader>
                <Table.ColumnHeader>Coverage</Table.ColumnHeader>
                <Table.ColumnHeader>Year</Table.ColumnHeader>
                <Table.ColumnHeader>Dated</Table.ColumnHeader>
                <Table.ColumnHeader>Lengths</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="center">DOI</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {waiting
                ? SKELETON_ROWS.map((i) => (
                    <Table.Row key={i} h="44px">
                      <Table.Cell>
                        <Skeleton boxSize="14px" borderRadius="full" />
                      </Table.Cell>
                      <Table.Cell>
                        <Skeleton h="3" w={`${80 - i * 12}%`} />
                      </Table.Cell>
                      <Table.Cell>
                        <Skeleton h="3" w="70%" />
                      </Table.Cell>
                      <Table.Cell>
                        <Skeleton h="3" w="70%" />
                      </Table.Cell>
                      <Table.Cell>
                        <Skeleton h="3" w="50%" />
                      </Table.Cell>
                      <Table.Cell>
                        <Skeleton h="3" w="60%" />
                      </Table.Cell>
                      <Table.Cell />
                    </Table.Row>
                  ))
                : rows.map((c) => {
                    const selected = c.id === selectedId;
                    return (
                      <Table.Row
                        key={c.id}
                        data-testid="tree-row"
                        data-selected={selected || undefined}
                        aria-selected={selected}
                        h="44px"
                        cursor="pointer"
                        bg={selected ? 'colorPalette.subtle' : undefined}
                        _hover={{ bg: selected ? 'colorPalette.subtle' : 'bg.subtle' }}
                        onClick={() => select(c.id)}
                      >
                        <Table.Cell>
                          <RadioGroup.Item value={c.id} display="flex">
                            <RadioGroup.ItemHiddenInput aria-label={c.title} />
                            <RadioGroup.ItemIndicator />
                          </RadioGroup.Item>
                        </Table.Cell>
                        <Table.Cell>
                          <Tooltip
                            content={c.citation || c.title}
                            showArrow
                            openDelay={400}
                            contentProps={{ maxW: '360px' }}
                          >
                            <Text truncate fontWeight={selected ? 'semibold' : 'medium'}>
                              {c.title}
                            </Text>
                          </Tooltip>
                        </Table.Cell>
                        <Table.Cell>
                          <CoverageCell c={c} />
                        </Table.Cell>
                        <Table.Cell fontVariantNumeric="tabular-nums" color="fg.muted">
                          {yearLabel(c)}
                        </Table.Cell>
                        <Table.Cell>
                          {c.branchLengths === 'time' ? (
                            <HStack gap={1}>
                              <Icon as={LuCheck} color="brand.fg" aria-label="dated" />
                              <Text as="span" color="fg.muted">
                                {c.timeUnit ?? 'time'}
                              </Text>
                            </HStack>
                          ) : (
                            <Text as="span" color="fg.muted" aria-label="not dated">
                              –
                            </Text>
                          )}
                        </Table.Cell>
                        <Table.Cell>
                          <LengthsCell c={c} />
                        </Table.Cell>
                        <Table.Cell textAlign="center">
                          {c.doi ? (
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
                          )}
                        </Table.Cell>
                      </Table.Row>
                    );
                  })}
            </Table.Body>
          </Table.Root>
        </Box>
      </RadioGroup.Root>
    );
  }

  const checking = candidates.filter((c) => c.coverageState === 'pending').length;

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
          {candidates.length > 0 && (
            <Text as="span" textTransform="none" letterSpacing="normal" fontWeight="normal" fontVariantNumeric="tabular-nums">
              {' '}
              · {fmtInt(candidates.length)} {candidates.length === 1 ? 'tree' : 'trees'}
              {checking > 0 && ` · checking coverage of ${fmtInt(checking)}`}
            </Text>
          )}
        </Text>
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
          Coverage counts dataset species found among each tree's tips. Hover a source for its citation.
        </Text>
      )}
    </Stack>
  );
});
