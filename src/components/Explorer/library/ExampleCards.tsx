import { Badge, Box, Flex, Grid, HStack, Icon, Text, VisuallyHidden } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import type { IconType } from 'react-icons';
import { LuBird, LuCat, LuMapPin, LuPawPrint, LuShell, LuSparkles, LuTreeDeciduous, LuWaves } from 'react-icons/lu';
import { areaLabel, describeQuery, type OccurrenceQuery } from '@/sources';
import { useStore } from '../../../store';
import type { SavedQuery, Tab } from '../../../store/explorer/types';

/** Why each store example is interesting, and its icon (keyed by SavedQuery id). */
export const EXAMPLE_NOTES: Record<string, { why: string; icon: IconType }> = {
  'example-marmosets': { why: 'Do Amazonian rivers split the regions? A classic barrier test.', icon: LuPawPrint },
  'example-cats': { why: 'One family on every continent: do the classic realms emerge?', icon: LuCat },
  'example-hummingbirds': { why: 'Steep turnover along the Andes, from museum specimens only.', icon: LuBird },
  'example-oaks': { why: 'Oak diversity peaks in Mexico. Where do the floras meet?', icon: LuTreeDeciduous },
  'example-dolphins': { why: 'Merges GBIF and OBIS: shelf, slope and open-ocean provinces.', icon: LuWaves },
  'example-corals': { why: 'Merges GBIF and OBIS on the richest reefs on Earth.', icon: LuShell },
};

export function exampleNote(item: SavedQuery): { why: string; icon: IconType } {
  const d = describeQuery(item.query);
  return EXAMPLE_NOTES[item.id] ?? { why: `${d.taxa} in ${d.area}, ${d.years.toLowerCase()}.`, icon: LuSparkles };
}

/** Restore a saved, recent or example query and show it (restore re-previews, never loads). */
export function restoreInto(store: { restore(id: string): void; setTab(tab: Tab): void }, item: Pick<SavedQuery, 'id'>) {
  store.restore(item.id);
  store.setTab('search');
}

/** Sources that can serve the example: OBIS only when a taxon has an AphiaID. */
export function sourcesLabel(q: OccurrenceQuery): string[] {
  const out: string[] = [];
  if (q.sources.gbif) out.push('GBIF');
  if (q.sources.obis && q.taxa.some((t) => t.obisId != null)) out.push('OBIS');
  return out;
}

const ExampleCard = observer(function ExampleCard({ ex }: { ex: SavedQuery }) {
  const { explorerStore } = useStore();
  const note = exampleNote(ex);
  const taxon = ex.query.taxa[0];
  const area = areaLabel(ex.query.area);
  return (
    <Box
      as="button"
      data-testid="example-card"
      textAlign="start"
      display="flex"
      flexDirection="column"
      gap={2}
      p={3.5}
      h="full"
      minW={0}
      bg="bg"
      borderWidth="1px"
      borderColor="border"
      rounded="lg"
      cursor="pointer"
      transition="border-color 0.15s, background 0.15s, box-shadow 0.15s"
      _hover={{ borderColor: 'border.emphasized', bg: 'bg.subtle', shadow: 'xs' }}
      focusVisibleRing="outside"
      onClick={() => restoreInto(explorerStore, ex)}
    >
      {/* The visible text is the accessible name (label-in-name); this only adds the verb. */}
      <VisuallyHidden>Use example:</VisuallyHidden>
      <HStack gap={2.5} w="full" align="flex-start">
        <Flex
          flexShrink={0}
          boxSize="8"
          rounded="md"
          align="center"
          justify="center"
          bg="colorPalette.subtle"
          color="colorPalette.fg"
        >
          <Icon as={note.icon} boxSize="4" />
        </Flex>
        <Box minW={0} flex="1">
          <Text fontSize="sm" fontWeight="semibold" lineHeight="short" lineClamp={2}>
            {ex.name}
          </Text>
          <Text fontSize="xs" color="fg.muted" truncate>
            <Text as="span" fontStyle="italic">
              {taxon?.name}
            </Text>{' '}
            · {taxon?.rank.toLowerCase()}
          </Text>
        </Box>
      </HStack>
      <Text fontSize="xs" color="fg.muted" lineClamp={2} minH="2lh" flex="1">
        {note.why}
      </Text>
      <HStack gap={1.5} w="full" fontSize="xs" color="fg.muted" minW={0}>
        <Icon as={LuMapPin} boxSize="3" flexShrink={0} />
        <Text truncate flex="1" minW={0}>
          {area}
        </Text>
        {sourcesLabel(ex.query).map((s) => (
          <Badge key={s} size="xs" variant="outline" flexShrink={0}>
            {s}
          </Badge>
        ))}
      </HStack>
    </Box>
  );
});

/** Grid of example studies for the empty preview state; a click restores the query (it never loads). */
export default observer(function ExampleCards() {
  const { explorerStore } = useStore();
  return (
    <Box as="section" aria-label="Example studies">
      <Flex align="baseline" gap={2} wrap="wrap" mb={2.5}>
        <Text as="h3" fontSize="sm" fontWeight="semibold">
          Or start from an example
        </Text>
        <Text fontSize="xs" color="fg.muted">
          It only fills in the query; nothing loads until you press Load.
        </Text>
      </Flex>
      <Grid templateColumns="repeat(auto-fill, minmax(min(100%, 210px), 1fr))" gap={3}>
        {explorerStore.examples.map((ex) => (
          <ExampleCard key={ex.id} ex={ex} />
        ))}
      </Grid>
    </Box>
  );
});
