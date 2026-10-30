import { HStack, Stack, Text } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { depthLabel } from '@/sources';
import { useStore } from '../../../store';
import NumberField from './NumberField';

/** Depth range in meters; only OBIS filters by depth, so the inputs show only with OBIS on. */
export default observer(function DepthField() {
  const { explorerStore } = useStore();
  const q = explorerStore.query;
  const [min, max] = q.depth;
  const obisOn = q.sources.obis;
  const set = min != null || max != null;

  // One look per OBIS state: the toggle alone decides. The loading lock only dims the column.
  if (!obisOn) {
    return (
      <Text fontSize="xs" color="fg.muted" lineHeight="short">
        Turn on OBIS to filter marine records by depth.
        {set && <> Your range ({depthLabel(q.depth)}) applies again when OBIS is on.</>}
      </Text>
    );
  }

  return (
    <Stack gap={1.5}>
      <HStack gap={2}>
        <NumberField
          label="Minimum depth in meters"
          value={min}
          placeholder="Surface"
          min={0}
          max={11000}
          step={10}
          w="96px"
          onCommit={(v) => explorerStore.setDepth([v, max])}
        />
        <Text color="fg.muted" aria-hidden>
          –
        </Text>
        <NumberField
          label="Maximum depth in meters"
          value={max}
          placeholder="Any"
          min={0}
          max={11000}
          step={10}
          w="96px"
          onCommit={(v) => explorerStore.setDepth([min, v])}
        />
        <Text fontSize="sm" color="fg.muted">
          m
        </Text>
      </HStack>
      <Text fontSize="xs" color="fg.muted">
        {set
          ? 'Records that report no depth are left out.'
          : 'Leave empty for any depth. A range drops records without depth.'}
      </Text>
    </Stack>
  );
});
