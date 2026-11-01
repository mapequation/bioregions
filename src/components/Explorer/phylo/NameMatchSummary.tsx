import { Badge, Box, Button, Collapsible, Flex, HStack, Icon, Link, Progress, Stack, Text } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { useEffect, useRef, useState } from 'react';
import { LuCheck, LuChevronRight, LuCopy, LuExternalLink } from 'react-icons/lu';
import { useStore } from '../../../store';
import type { MatchStatus, NameMatchRow } from '../../../store/explorer/types';
import { fmtInt } from '../format';

const OTOL_SEARCH = 'https://tree.opentreeoflife.org/';

/** Copy button with a short "Copied" confirmation. */
function CopyButton({ text, what }: { text: string; what: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <Button
      size="xs"
      variant="ghost"
      aria-label={`Copy ${what}`}
      disabled={!text}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <LuCheck /> : <LuCopy />}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

/** Collapsible name list with a count and a Copy action. */
function NameList({
  title,
  rows,
  copyText,
  render,
  defaultOpen = false,
}: {
  title: string;
  rows: NameMatchRow[];
  copyText: string;
  render: (row: NameMatchRow) => React.ReactNode;
  defaultOpen?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <Collapsible.Root defaultOpen={defaultOpen}>
      <Flex align="center" justify="space-between" gap={2}>
        <Collapsible.Trigger asChild>
          <Button size="xs" variant="ghost" px={1} ms={-1} fontWeight="medium" className="group" _expanded={{ bg: 'transparent' }} _hover={{ bg: 'bg.muted' }}>
            <Icon
              as={LuChevronRight}
              transition="transform 0.15s"
              _groupExpanded={{ transform: 'rotate(90deg)' }}
              color="fg.muted"
            />
            {title}
            <Text as="span" color="fg.muted" fontVariantNumeric="tabular-nums">
              ({fmtInt(rows.length)})
            </Text>
          </Button>
        </Collapsible.Trigger>
        <CopyButton text={copyText} what={title.toLowerCase()} />
      </Flex>
      <Collapsible.Content>
        <Box
          as="ul"
          listStyleType="none"
          mt={1}
          maxH="220px"
          overflowY="auto"
          borderWidth="1px"
          borderColor="border.muted"
          borderRadius="md"
          bg="bg.subtle"
          py={1}
        >
          {rows.map((row, i) => (
            // Dataset names are unique per load, but the index guards against repeats.
            // biome-ignore lint/suspicious/noArrayIndexKey: static list, index disambiguates repeats
            <Box as="li" key={`${row.datasetName}:${i}`} px={2.5} py={0.5} textStyle="xs" lineHeight="tall">
              {render(row)}
            </Box>
          ))}
        </Box>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

function Swatch({ bg, opacity }: { bg: string; opacity?: number }) {
  return <Box as="span" display="inline-block" boxSize="8px" borderRadius="2px" bg={bg} opacity={opacity} flexShrink={0} />;
}

const byStatus = (rows: NameMatchRow[], statuses: MatchStatus[]) => rows.filter((r) => statuses.includes(r.status));

/** NAMES: progress of the Open Tree name matching, then matched/synonym/unmatched counts and lists. */
export default observer(function NameMatchSummary() {
  const { phyloStore, speciesStore, explorerStore } = useStore();
  const { matches, matchProgress, counts, speciesSource } = phyloStore;
  const total = matchProgress?.total ?? (matches.length || (speciesSource === 'loaded' ? speciesStore.numSpecies : 0));
  const synonyms = byStatus(matches, ['synonym']);
  const unmatched = byStatus(matches, ['unmatched', 'ambiguous']);
  const sum = counts.matched + counts.synonym + counts.unmatched;
  const share = (n: number) => (sum > 0 ? `${(n / sum) * 100}%` : '0%');
  const noMatches = matchProgress == null && sum > 0 && counts.matched + counts.synonym === 0;
  const sourceLabel = speciesSource === 'query' ? 'species in the query' : 'loaded species';
  // Query species GBIF counts but cannot name (no accepted species name): never matched.
  const withoutName =
    speciesSource === 'query' && 'speciesWithoutName' in explorerStore
      ? Number(explorerStore.speciesWithoutName) || 0
      : 0;

  const copyUnmatched = [
    ...new Set(
      [phyloStore.copyList('unmatched'), phyloStore.copyList('ambiguous')]
        .join('\n')
        .split('\n')
        .filter(Boolean),
    ),
  ].join('\n');

  return (
    <Stack data-testid="phylo-match-summary" gap={3} p={4} aria-busy={matchProgress != null}>
      <Flex align="baseline" justify="space-between" gap={2}>
        <Text as="h3" textStyle="xs" fontWeight="semibold" letterSpacing="wider" textTransform="uppercase" color="fg.muted">
          Names
        </Text>
        <Text textStyle="xs" color="fg.muted" fontVariantNumeric="tabular-nums" truncate>
          {total > 0 ? `${fmtInt(total)} ${sourceLabel} → Open Tree` : `${sourceLabel} → Open Tree`}
        </Text>
      </Flex>

      {matchProgress != null ? (
        <Stack gap={1.5}>
          <Progress.Root
            size="sm"
            value={matchProgress.total > 0 ? (matchProgress.done / matchProgress.total) * 100 : null}
            aria-label="Matching names with Open Tree"
            aria-valuetext={`${fmtInt(matchProgress.done)} of ${fmtInt(matchProgress.total)} names matched`}
          >
            <Progress.Track>
              <Progress.Range />
            </Progress.Track>
          </Progress.Root>
          <Flex justify="space-between" textStyle="xs" color="fg.muted" fontVariantNumeric="tabular-nums">
            <Text>Matching names with Open Tree…</Text>
            <Text>
              {fmtInt(matchProgress.done)} / {fmtInt(matchProgress.total)}
            </Text>
          </Flex>
        </Stack>
      ) : (
        <Stack gap={2}>
          <Flex
            role="img"
            aria-label={`${fmtInt(counts.matched)} matched, ${fmtInt(counts.synonym)} matched through a synonym, ${fmtInt(counts.unmatched)} unmatched`}
            h="10px"
            borderRadius="sm"
            overflow="hidden"
            bg="bg.muted"
            gap="1px"
          >
            {counts.matched > 0 && <Box w={share(counts.matched)} bg="brand.solid" />}
            {counts.synonym > 0 && <Box w={share(counts.synonym)} bg="brand.solid" opacity={0.5} />}
            {counts.unmatched > 0 && <Box w={share(counts.unmatched)} bg="orange.solid" />}
          </Flex>
          <HStack gap={3} wrap="wrap" textStyle="xs" fontVariantNumeric="tabular-nums" rowGap={1}>
            <HStack gap={1.5}>
              <Swatch bg="brand.solid" />
              <Text>
                <Text as="span" fontWeight="semibold">
                  {fmtInt(counts.matched)}
                </Text>{' '}
                matched
              </Text>
            </HStack>
            <HStack gap={1.5}>
              <Swatch bg="brand.solid" opacity={0.5} />
              <Text>
                <Text as="span" fontWeight="semibold">
                  {fmtInt(counts.synonym)}
                </Text>{' '}
                {counts.synonym === 1 ? 'synonym' : 'synonyms'}
              </Text>
            </HStack>
            <HStack gap={1.5}>
              <Swatch bg="orange.solid" />
              <Text>
                <Text as="span" fontWeight="semibold">
                  {fmtInt(counts.unmatched)}
                </Text>{' '}
                unmatched
              </Text>
            </HStack>
          </HStack>
        </Stack>
      )}

      {withoutName > 0 && matchProgress == null && (
        <Text textStyle="xs" color="fg.muted" fontVariantNumeric="tabular-nums" data-testid="phylo-without-name">
          Plus {fmtInt(withoutName)} species without an accepted name, which can't be
          matched.
        </Text>
      )}

      {noMatches && (
        <Text textStyle="xs" color="fg.muted">
          None of these names were found in the Open Tree taxonomy, so no tree can be built. Check the spelling, or{' '}
          <Link href={OTOL_SEARCH} target="_blank" rel="noreferrer" color="fg" textDecoration="underline">
            search Open Tree <LuExternalLink />
          </Link>
          .
        </Text>
      )}

      {(synonyms.length > 0 || unmatched.length > 0) && (
        <Stack gap={1}>
          <NameList
            title="Synonyms"
            rows={synonyms}
            copyText={phyloStore.copyList('synonym')}
            render={(row) => (
              <Flex gap={1.5} wrap="wrap" columnGap={1.5}>
                <Text as="span" fontStyle="italic" color="fg.muted">
                  {row.datasetName}
                </Text>
                <Text as="span" color="fg.muted" aria-label="accepted as">
                  →
                </Text>
                <Text as="span" fontStyle="italic">
                  {row.ottName ?? '–'}
                </Text>
              </Flex>
            )}
          />
          <NameList
            title="Unmatched"
            rows={unmatched}
            copyText={copyUnmatched}
            defaultOpen={noMatches}
            render={(row) => (
              <Flex gap={2} align="center" justify="space-between">
                <Text as="span" fontStyle="italic" truncate>
                  {row.datasetName}
                </Text>
                {row.status === 'ambiguous' && (
                  <Badge size="xs" variant="subtle" colorPalette="orange" flexShrink={0}>
                    ambiguous
                  </Badge>
                )}
              </Flex>
            )}
          />
          <Text textStyle="xs" color="fg.muted">
            Unmatched and ambiguous names can't be placed on a tree. Synonyms are placed under the accepted name.
          </Text>
        </Stack>
      )}
    </Stack>
  );
});
