import { observer } from 'mobx-react';
import { LuChevronDown, LuQuote, LuSearch, LuSquarePen } from 'react-icons/lu';
import { Button, HStack, Menu, Portal, Progress, Stack, Text, VStack } from '@chakra-ui/react';
import { queryTitle } from '@/sources';
import { LoadData, LoadExample } from './Load';
import { useStore } from '../../store';
import { explorerJob } from '../../store/ExplorerStore';
import Stat from '../Stat';
import { fmtCompact, fmtInt } from '../Explorer/format';

/** Keeps year ranges such as 1970–2025 on one line (word joiners around the dash). */
const keepRangesTogether = (s: string) => s.replace(/(\d)–(\d)/g, '$1\u2060–\u2060$2');

/** Live status of an explorer load, shown while the Data portal is closed. */
const ExplorerLoadStatus = observer(function ExplorerLoadStatus() {
  const { explorerStore, dataStore } = useStore();
  const job = explorerJob(dataStore.job);
  if (!job || (job.state !== 'planning' && job.state !== 'streaming')) return null;
  const fetched = job.perSource.reduce((s, p) => s + p.fetched, 0);
  const expected = job.perSource.reduce((s, p) => s + p.expected, 0);
  const sources = job.perSource.map((p) => p.source.toUpperCase()).join(' + ') || 'Explorer';
  const value = expected > 0 ? Math.min(100, (fetched / expected) * 100) : null;
  const count = `${fmtCompact(fetched)}${expected > 0 ? ` / ${fmtCompact(expected)}` : ''}`;
  const text = job.state === 'planning' ? 'Planning…' : `${sources} ${count}`;
  const label = keepRangesTogether(job.label);
  return (
    <Stack gap={1.5} p={2.5} borderWidth="1px" borderRadius="md" bg="bg.subtle">
      <Text fontSize="xs" color="fg.muted" truncate title={label}>
        Loading {label}
      </Text>
      <Progress.Root size="xs" value={value} aria-label="Explorer load progress" aria-valuetext={text}>
        <Progress.Track>
          <Progress.Range />
        </Progress.Track>
      </Progress.Root>
      <HStack gap={2} fontSize="xs" aria-hidden>
        <Text flex="1" minW={0} truncate color="fg.muted">
          {job.state === 'planning' ? 'Planning…' : sources}
        </Text>
        {job.state !== 'planning' && (
          <Text fontVariantNumeric="tabular-nums" flexShrink={0}>
            {count}
          </Text>
        )}
      </HStack>
      <HStack gap={2}>
        <Button size="xs" variant="outline" flex="1" onClick={() => explorerStore.open('search')}>
          Open explorer
        </Button>
        <Menu.Root>
          <Menu.Trigger asChild>
            <Button size="xs" variant="outline" colorPalette="red" flex="1">
              Cancel <LuChevronDown />
            </Button>
          </Menu.Trigger>
          <Portal>
            <Menu.Positioner>
              <Menu.Content>
                <Menu.Item value="keep" onClick={() => dataStore.cancel('keep')}>
                  Keep {fmtInt(job.funnel.accepted)} records and run Infomap
                </Menu.Item>
                <Menu.Item value="discard" color="fg.error" onClick={() => dataStore.cancel('discard')}>
                  Discard and restore previous data
                </Menu.Item>
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
      </HStack>
    </Stack>
  );
});

/** After an explorer load: what was loaded, with shortcuts back into the explorer. */
const ExplorerLoadedSummary = observer(function ExplorerLoadedSummary() {
  const { explorerStore } = useStore();
  const last = explorerStore.loaded;
  if (!last || explorerStore.isLoading) return null;
  const title = keepRangesTogether(queryTitle(last.query));
  return (
    <Stack gap={1.5} p={2.5} borderWidth="1px" borderRadius="md">
      <Text fontSize="sm" fontWeight="medium" lineClamp={2} title={title}>
        {title}
      </Text>
      <Text fontSize="xs" color="fg.muted" fontVariantNumeric="tabular-nums">
        {fmtInt(last.funnel.accepted)} records
        {last.kpis.species != null ? ` · ${fmtInt(last.kpis.species)} species` : ''}
        {last.partial ? ' · partial' : ''}
      </Text>
      <HStack gap={2}>
        <Button size="xs" variant="outline" flex="1" onClick={() => explorerStore.open('search')}>
          <LuSquarePen /> Edit query
        </Button>
        <Button size="xs" variant="outline" flex="1" onClick={() => explorerStore.open('cite')}>
          <LuQuote /> Cite
        </Button>
      </HStack>
    </Stack>
  );
});

export default observer(function Data() {
  const { speciesStore, treeStore, explorerStore, dataStore } = useStore();
  const explorerLoad = explorerJob(dataStore.job) != null;
  return (
    <VStack align="stretch">
      <LoadData />
      <LoadExample />
      <Button size="sm" variant="solid" data-testid="explorer-open" onClick={() => explorerStore.open()}>
        <LuSearch /> Explore GBIF & OBIS…
      </Button>

      <ExplorerLoadStatus />
      <ExplorerLoadedSummary />

      {(treeStore.isLoading || speciesStore.isLoading) && !explorerLoad && (
        <Progress.Root size="xs" value={null}>
          <Progress.Track>
            <Progress.Range />
          </Progress.Track>
        </Progress.Root>
      )}

      {speciesStore.isLoading && !explorerLoad && (
        <Button size="sm" colorPalette="red" variant="outline" onClick={() => speciesStore.cancelLoad()}>
          Cancel
        </Button>
      )}

      {speciesStore.numRecords > 0 && <Stat label="Time">{speciesStore.seconds.toLocaleString()} s</Stat>}

      {speciesStore.numRecords > 0 && (
        <Stat label="Speed">{Math.round(speciesStore.speed).toLocaleString()} records/s</Stat>
      )}

      {speciesStore.numPointsDebounced > 0 && (
        <Stat label="Point occurrences">{speciesStore.numPointsDebounced.toLocaleString()}</Stat>
      )}

      {speciesStore.numPolygonsDebounced > 0 && (
        <Stat label="Polygons">{speciesStore.numPolygonsDebounced.toLocaleString()}</Stat>
      )}

      {treeStore.isLoaded && <Stat label="Species in tree">{treeStore.numLeafNodes.toLocaleString()}</Stat>}
    </VStack>
  );
});
