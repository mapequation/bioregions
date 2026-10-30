import { Alert, Box, Button, Flex, HStack, Icon, Spinner, Text } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { LuCircleCheck, LuMap, LuQuote } from 'react-icons/lu';
import { useStore } from '@/store';
import { fmtInt, fmtPct } from '../format';

const Sep = () => (
  <Box as="span" aria-hidden color="fg.muted" mx={1.5}>
    ·
  </Box>
);

function timeOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}

/** Success panel shown in place of the KPI strip after a load, with the partial-load banner. */
export default observer(function LoadedPanel() {
  const { explorerStore: ex, infomapStore, speciesStore } = useStore();
  const last = ex.lastLoad;
  if (!last) return null;

  const records = last.funnel.accepted;
  const species = last.kpis.species;
  const datasetKeys = Object.values(last.datasetCounts).reduce((s, list) => s + (list?.length ?? 0), 0);
  const datasets = datasetKeys || last.kpis.datasets;
  const sources = Object.values(last.funnel.bySource).filter((s) => (s?.accepted ?? 0) > 0).length;
  const computing = infomapStore.isRunning || speciesStore.isLoading;
  const regions = infomapStore.numBioregions;
  const time = timeOf(last.retrievedAt);
  const partial = last.partial;

  return (
    <Flex direction="column" gap={2} data-testid="loaded-panel">
      {partial && (
        <Alert.Root status="warning" size="sm" variant="subtle" borderRadius="md" py={2}>
          <Alert.Indicator />
          <Alert.Description fontSize="sm" fontVariantNumeric="tabular-nums">
            <Box as="span" fontWeight="semibold">
              Partial dataset:
            </Box>{' '}
            {fmtInt(partial.accepted)} of ~{fmtInt(partial.planned)} planned records (
            {fmtPct(partial.planned > 0 ? partial.accepted / partial.planned : 0)}). Some species may be
            under-sampled. The methods text says so.
          </Alert.Description>
        </Alert.Root>
      )}
      <Flex
        align="center"
        gap={3}
        rowGap={2}
        wrap="wrap"
        minH="3.5rem"
        px={3}
        py={2}
        borderRadius="md"
        borderWidth="1px"
        borderColor="border"
        bg="bg.subtle"
        role="status"
      >
        <HStack gap={3} flex="1 1 20rem" minW={0} align="center">
          <Icon as={LuCircleCheck} boxSize={5} color="green.fg" flexShrink={0} />
          <Box minW={0} fontVariantNumeric="tabular-nums">
            <Text fontSize="sm" fontWeight="semibold" color="fg" truncate>
              {last.mode === 'add' ? 'Added' : 'Loaded'} {fmtInt(records)} records
            </Text>
            <HStack gap={0} fontSize="xs" color="fg.muted" minW={0}>
              <Text truncate>
                {[
                  species != null ? `${fmtInt(species)} species` : null,
                  datasets ? `${fmtInt(datasets)} ${datasets === 1 ? 'dataset' : 'datasets'}` : null,
                  sources > 0 ? `${sources} ${sources === 1 ? 'source' : 'sources'}` : null,
                  time || null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              {(computing || regions > 0) && <Sep />}
              {computing ? (
                <HStack gap={1.5} flexShrink={0}>
                  <Spinner size="xs" />
                  <Text>Bioregions computing…</Text>
                </HStack>
              ) : regions > 0 ? (
                <Text flexShrink={0}>
                  {regions} {regions === 1 ? 'bioregion' : 'bioregions'}
                </Text>
              ) : null}
            </HStack>
          </Box>
        </HStack>
        <HStack gap={2} flexShrink={0} ms="auto">
          <Button size="sm" variant="outline" onClick={() => ex.setTab('cite')}>
            <LuQuote /> Cite this data
          </Button>
          <Button size="sm" variant="solid" onClick={() => ex.close()} data-testid="view-bioregions">
            <LuMap /> View bioregions
          </Button>
        </HStack>
      </Flex>
    </Flex>
  );
});
