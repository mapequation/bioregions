import { observer } from 'mobx-react';
import {
  Flex,
  Select,
  Button,
  ButtonGroup,
  VStack,
  FormControl,
  FormLabel,
  Switch,
  Spacer,
  Collapse,
  Box,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  Tag,
} from '@chakra-ui/react';
import { useStore } from '../../store';
import type { Projection, RenderType } from '../../store/MapStore';
import { PROJECTIONS, PROJECTIONNAME } from '../../store/MapStore';
import ColorSettings from './ColorSettings';

const ProjectionSelect = observer(function ProjectionSelect() {
  const { mapStore } = useStore();

  return (
    <Select
      size="sm"
      ml={1}
      variant="filled"
      value={mapStore.projectionName}
      name="projection"
      onChange={(e) => mapStore.setProjection(e.target.value as Projection)}
    >
      {PROJECTIONS.map((projection) => (
        <option value={projection} key={projection}>
          {PROJECTIONNAME[projection]}
        </option>
      ))}
    </Select>
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
        <ButtonGroup
          variant="outline"
          isAttached
          size="sm"
          isDisabled={!speciesStore.loaded || speciesStore.isLoading}
        >
          <Button
            onClick={setRenderType('records')}
            isActive={mapStore.renderType === 'records'}
          >
            Records
          </Button>
          <Button
            onClick={setRenderType('heatmap')}
            isActive={mapStore.renderType === 'heatmap'}
          >
            Heatmap
          </Button>
          <Button
            onClick={setRenderType('bioregions')}
            isLoading={infomapStore.isRunning}
            isDisabled={!infomapStore.haveBioregions}
            isActive={mapStore.renderType === 'bioregions'}
          >
            Bioregions
          </Button>
        </ButtonGroup>
      </Flex>
      <FormControl display="flex" w="100%" alignItems="center">
        <FormLabel htmlFor="clip" mb="0">
          Clip to land
        </FormLabel>
        <Spacer />
        <Switch
          id="clip"
          isChecked={mapStore.clipToLand}
          onChange={() => mapStore.setClipToLand(!mapStore.clipToLand)}
        />
      </FormControl>
      <FormControl display="flex" w="100%" alignItems="center">
        <FormLabel htmlFor="colorModuleParticipation" mb="0">
          Show inter-connected bioregions
        </FormLabel>
        <Spacer />
        <Switch
          id="colorModuleParticipation"
          isChecked={mapStore.colorModuleParticipation}
          onChange={() =>
            mapStore.setColorModuleParticipation(
              !mapStore.colorModuleParticipation,
            )
          }
        />
      </FormControl>

      <Collapse
        in={mapStore.colorModuleParticipation}
        animateOpacity
        style={{ width: '100%', marginTop: 0 }}
      >
        <Flex w="100%" pl="10px" py={2}>
          <Box minW="100px" fontSize="0.9rem">
            Strength
          </Box>
          <Slider
            mx={3}
            isDisabled={!mapStore.colorModuleParticipation}
            focusThumbOnChange={false}
            value={mapStore.colorModuleParticipationStrength}
            onChange={(value) =>
              mapStore.setColorModuleParticipationStrength(value)
            }
            onChangeEnd={(value) =>
              mapStore.setColorModuleParticipationStrength(value, true)
            }
            min={0}
            max={1}
            step={0.1}
          >
            <SliderTrack>
              <SliderFilledTrack />
            </SliderTrack>
            <SliderThumb fontSize="sm" boxSize="16px" />
          </Slider>
          <Tag size="sm" minW={50}>
            {mapStore.colorModuleParticipationStrength}
          </Tag>
        </Flex>
      </Collapse>

      <ColorSettings />
    </VStack>
  );
});
