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
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  Box,
  HStack,
} from '@chakra-ui/react';
import { useState } from 'react';
import { useStore } from '../../store';
import type { Projection, RenderType } from '../../store/MapStore';
import { PROJECTIONS, PROJECTIONNAME } from '../../store/MapStore';
import { SchemeName } from '@mapequation/c3';
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
            isDisabled={infomapStore.tree == null}
            isActive={mapStore.renderType === 'bioregions'}
          >
            Bioregions
          </Button>
        </ButtonGroup>
      </Flex>
      <FormControl
        display="flex"
        w="100%"
        alignItems="center"
        isDisabled={true}
      >
        <FormLabel htmlFor="clip" mb="0">
          Clip to land
        </FormLabel>
        <Spacer />
        <Switch id="clip" defaultChecked isDisabled={true} />
      </FormControl>

      <ColorSettings />
    </VStack>
  );
});
