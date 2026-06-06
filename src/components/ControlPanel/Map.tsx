import { observer } from 'mobx-react';
import {
  Flex,
  Button,
  ButtonGroup,
  VStack,
  Spacer,
  Box,
  Tag,
  Field,
  Collapsible,
} from '@chakra-ui/react';
import { useStore } from '../../store';
import type {
  HeatmapTarget,
  Projection,
  RenderType,
} from '../../store/MapStore';
import {
  PROJECTIONS,
  PROJECTIONNAME,
  HEATMAP_TARGETS,
  HEATMAP_TARGET_NAME,
} from '../../store/MapStore';
import ColorSettings from './ColorSettings';
import Select from './Select';
import { Switch } from '../ui/switch';
import { Slider } from '../ui/slider';

const ProjectionSelect = observer(function ProjectionSelect() {
  const { mapStore } = useStore();

  return (
    <Select
      size="sm"
      ml={1}
      // variant="filled"
      value={[mapStore.projectionName]}
      name="projection"
      onValueChange={(e) => mapStore.setProjection(e.value[0] as Projection)}
      items={PROJECTIONS.map((projection) => ({
        label: PROJECTIONNAME[projection],
        value: projection,
      }))}
    />
  );
});

export default observer(function Map() {
  const { mapStore, speciesStore, infomapStore } = useStore();

  const setRenderType = (type: RenderType) => () => {
    if (type !== mapStore.renderType) {
      mapStore.setRenderType(type);
      mapStore.render();
    }
  };

  return (
    <VStack>
      <ProjectionSelect />
      <Flex w="100%">
        <Field.Root disabled={!speciesStore.loaded || speciesStore.isLoading}>
          <ButtonGroup variant="outline" attached size="sm">
            <Button
              onClick={setRenderType('records')}
              variant={mapStore.renderType === 'records' ? 'solid' : 'outline'}
            >
              Records
            </Button>
            <Button
              onClick={setRenderType('heatmap')}
              variant={mapStore.renderType === 'heatmap' ? 'solid' : 'outline'}
            >
              Heatmap
            </Button>
            <Button
              onClick={setRenderType('bioregions')}
              loading={infomapStore.isRunning}
              disabled={!infomapStore.haveBioregions}
              variant={
                mapStore.renderType === 'bioregions' ? 'solid' : 'outline'
              }
            >
              Bioregions
            </Button>
          </ButtonGroup>
        </Field.Root>
      </Flex>
      {mapStore.renderType === 'heatmap' && (
        <Field.Root display="flex" flexDir="row" w="100%" alignItems="center">
          <Field.Label htmlFor="clip" mb="0">
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
        <Field.Label htmlFor="clip" mb="0">
          Clip to land
        </Field.Label>
        <Spacer />
        <Switch
          id="clip"
          checked={mapStore.clipToLand}
          onCheckedChange={() => mapStore.setClipToLand(!mapStore.clipToLand)}
        />
      </Field.Root>
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
      <Field.Root display="flex" flexDir="row" w="100%" alignItems="center">
        <Field.Label htmlFor="colorModuleParticipation" mb="0">
          Show inter-connected bioregions
        </Field.Label>
        <Spacer />
        <Switch
          id="colorModuleParticipation"
          checked={mapStore.colorModuleParticipation}
          onCheckedChange={() =>
            mapStore.setColorModuleParticipation(
              !mapStore.colorModuleParticipation,
            )
          }
        />
      </Field.Root>

      <Collapsible.Root
        open={mapStore.colorModuleParticipation}
        style={{ width: '100%', marginTop: 0 }}
      >
        <Collapsible.Content>
          <Flex w="100%" pl="10px" py={2} alignItems="center">
            <Box minW="100px" fontSize="0.9rem">
              Strength
            </Box>
            <Slider
              mx={3}
              w="100%"
              size="sm"
              disabled={!mapStore.colorModuleParticipation}
              // focusThumbOnChange={false}
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
            ></Slider>
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
