import { HStack, Stack, Text } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { useStore } from '../../../store';
import NumberField from './NumberField';

/** Depth range in meters; meaningful for marine (OBIS) records. */
export default observer(function DepthField() {
  const { explorerStore } = useStore();
  const q = explorerStore.query;
  const [min, max] = q.depth;
  const obisOn = q.sources.obis;
  const set = min != null || max != null;

  if (!obisOn && !set) {
    return (
      <Text fontSize="xs" color="fg.muted">
        Turn on OBIS to filter marine records by depth.
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
