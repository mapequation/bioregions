import { observer } from 'mobx-react';
import {
  Flex,
  VStack,
  Spacer,
  Box,
  Tag,
  Field,
  Collapsible,
} from '@chakra-ui/react';
import { useStore } from '../../store';
import type { HeatmapTarget } from '../../store/MapStore';
import { HEATMAP_TARGETS, HEATMAP_TARGET_NAME } from '../../store/MapStore';
import ColorSettings from './ColorSettings';
import Select from './Select';
import { Switch } from '../ui/switch';
import { Slider } from '../ui/slider';

export default observer(function Map() {
  const { mapStore } = useStore();

  return (
    <VStack>
      {mapStore.renderType === 'heatmap' && (
        <Field.Root display="flex" flexDir="row" w="100%" alignItems="center">
          <Field.Label htmlFor="heatmapTarget" mb="0">
            Heatmap value
          </Field.Label>
          <Spacer />
          <Select
            size="sm"
            value={[mapStore.heatmapTarget]}
            name="heatmapTarget"
            onValueChange={(e) =>
              mapStore.setHeatmapTarget(e.value[0] as HeatmapTarget, true)
            }
            items={HEATMAP_TARGETS.map((target) => ({
              label: HEATMAP_TARGET_NAME[target],
              value: target,
            }))}
          />
        </Field.Root>
      )}

      <Field.Root display="flex" flexDir="row" w="100%" alignItems="center">
        <Field.Label htmlFor="fineLand" mb="0">
          Detailed land
        </Field.Label>
        <Spacer />
        <Switch
          id="fineLand"
          checked={mapStore.useFineLand}
          onCheckedChange={() => mapStore.setUseFineLand(!mapStore.useFineLand)}
        />
      </Field.Root>

      <Collapsible.Root
        open={mapStore.colorModuleParticipation}
        style={{ width: '100%', marginTop: 0 }}
      >
        <Collapsible.Content>
          <Flex w="100%" pl="10px" py={2} alignItems="center">
            <Box minW="100px" fontSize="0.9rem">
              Boundary strength
            </Box>
            <Slider
              mx={3}
              w="100%"
              size="sm"
              disabled={!mapStore.colorModuleParticipation}
              value={[mapStore.colorModuleParticipationStrength]}
              onValueChange={(e) =>
                mapStore.setColorModuleParticipationStrength(e.value[0])
              }
              onValueChangeEnd={(e) =>
                mapStore.setColorModuleParticipationStrength(e.value[0], true)
              }
              min={0}
              max={1}
              step={0.1}
            />
            <Tag.Root size="sm" minW={50}>
              <Tag.Label>{mapStore.colorModuleParticipationStrength}</Tag.Label>
            </Tag.Root>
          </Flex>
        </Collapsible.Content>
      </Collapsible.Root>

      <ColorSettings />
    </VStack>
  );
});
