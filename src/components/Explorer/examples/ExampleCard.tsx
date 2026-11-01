import { Badge, Box, Button, Flex, HStack, Icon, Stack, Text, VisuallyHidden } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import type { IconType } from 'react-icons';
import {
  LuBird,
  LuCat,
  LuCircleSlash,
  LuGitFork,
  LuMap,
  LuMapPin,
  LuPawPrint,
  LuShell,
  LuTreeDeciduous,
  LuWaves,
} from 'react-icons/lu';
import { useStore } from '../../../store';
import type { ExampleEntry, ExampleIcon } from '../../../store/data/catalog';
import { Tooltip } from '../../ui/tooltip';
import { primaryButtonProps, secondaryButtonProps } from '../buttonStyles';
import { approxNote, citationText, countsText, scopeText, sourceBadges, treeBadge } from './exampleText';

const ICONS: Record<ExampleIcon, IconType> = {
  paw: LuPawPrint,
  cat: LuCat,
  bird: LuBird,
  oak: LuTreeDeciduous,
  waves: LuWaves,
  shell: LuShell,
  map: LuMap,
};

function loadTooltip(entry: ExampleEntry, busy: boolean): string {
  if (busy) return 'A load is running. Wait for it to finish or stop it first.';
  if (entry.kind === 'query')
    return `Fill in this query on the Search tab and load it from ${entry.source.replace(' + ', ' and ')}; the record cap is raised to fit the example`;
  return entry.tree.included
    ? 'Load these occurrences and their tree, run Infomap, and close this dialog; progress shows in the Data panel'
    : 'Load these occurrences, run Infomap, and close this dialog; progress shows in the Data panel';
}

/** The tree badge in its three states (§5.3). */
export function TreeBadge({ tree }: { tree: ExampleEntry['tree'] }) {
  const b = treeBadge(tree);
  return (
    <Badge
      data-testid="example-tree-badge"
      data-state={b.state}
      size="sm"
      variant="subtle"
      colorPalette={b.palette}
      whiteSpace="normal"
      textAlign="start"
      gap={1}
    >
      <Icon as={b.state === 'none' ? LuCircleSlash : LuGitFork} boxSize="3" flexShrink={0} />
      {b.label}
    </Badge>
  );
}

/**
 * One catalog example (§5.3): what it is, how big, where it comes from, whether it has a
 * tree, how to cite it, and Load (plus Open in Search for a query example).
 */
export default observer(function ExampleCard({ entry }: { entry: ExampleEntry }) {
  const { dataStore, explorerStore } = useStore();
  const busy = dataStore.isLoading;
  const note = approxNote(entry);

  const load = () => {
    if (entry.kind === 'query') {
      void explorerStore.loadExampleQuery(entry);
      return;
    }
    void dataStore.loadExample(entry, 'examples');
    explorerStore.close();
  };

  const openInSearch = () => {
    if (!entry.query) return;
    explorerStore.restoreQuery(entry.query);
    explorerStore.setTab('search');
  };

  return (
    <Stack
      as="article"
      aria-label={entry.title}
      data-testid="example-card"
      data-kind={entry.kind}
      gap={2.5}
      p={3.5}
      h="full"
      minW={0}
      bg="bg"
      borderWidth="1px"
      borderColor="border"
      rounded="lg"
    >
      <HStack gap={2.5} align="flex-start">
        <Flex
          flexShrink={0}
          boxSize="8"
          rounded="md"
          align="center"
          justify="center"
          bg="colorPalette.subtle"
          color="colorPalette.fg"
          aria-hidden
        >
          <Icon as={ICONS[entry.icon] ?? LuMap} boxSize="4" />
        </Flex>
        <Box minW={0} flex="1">
          <Text as="h4" fontSize="sm" fontWeight="semibold" lineHeight="short">
            {entry.title}
          </Text>
          <HStack gap={1} fontSize="xs" color="fg.muted" minW={0}>
            <Icon as={LuMapPin} boxSize="3" flexShrink={0} />
            <Text truncate>{scopeText(entry)}</Text>
          </HStack>
        </Box>
      </HStack>

      {entry.why && (
        <Text fontSize="xs" color="fg.muted">
          {entry.why}
        </Text>
      )}

      <Stack gap={1} fontSize="xs">
        <HStack gap={1} wrap="wrap">
          <VisuallyHidden>Source:</VisuallyHidden>
          {sourceBadges(entry.source).map((s) => (
            <Badge key={s} size="xs" variant="outline">
              {s}
            </Badge>
          ))}
        </HStack>
        <Text fontVariantNumeric="tabular-nums">
          {countsText(entry)}
          {note && (
            <Text as="span" color="fg.muted">
              {' '}
              ({note})
            </Text>
          )}
        </Text>
        <Text color="fg.muted">{entry.size}</Text>
      </Stack>

      <Box>
        <TreeBadge tree={entry.tree} />
      </Box>

      <Box as="details" fontSize="xs" flex="1">
        <Box as="summary" cursor="pointer" color="fg.muted" w="fit-content" focusVisibleRing="outside">
          Cite<VisuallyHidden> {entry.title}</VisuallyHidden>
        </Box>
        <Text mt={1} userSelect="text">
          {citationText(entry)}
        </Text>
        {entry.tree.citation && (
          <Text mt={1} userSelect="text">
            Tree: {entry.tree.citation}
          </Text>
        )}
      </Box>

      <HStack gap={2}>
        <Tooltip content={loadTooltip(entry, busy)} openDelay={400}>
          <Box as="span" display="inline-flex">
            <Button {...primaryButtonProps} size="xs" disabled={busy} aria-label={`Load ${entry.title}`} onClick={load}>
              Load
            </Button>
          </Box>
        </Tooltip>
        {entry.kind === 'query' && (
          <Tooltip content="Fill in this query on the Search tab without loading it" openDelay={400}>
            <Button
              {...secondaryButtonProps}
              size="xs"
              aria-label={`Open in Search: ${entry.title}`}
              onClick={openInSearch}
            >
              Open in Search
            </Button>
          </Tooltip>
        )}
      </HStack>
    </Stack>
  );
});
