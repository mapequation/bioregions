import { observer } from 'mobx-react';
import { Flex, Spacer, Select, Button, ButtonGroup, VStack } from '@chakra-ui/react';
import { useStore } from '../../store';
import type { Projection, RenderType, GridColorBy } from '../../store/MapStore';
import { PROJECTIONS } from '../../store/MapStore';

const ProjectionSelect = observer(function () {
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
          {projection}
        </option>
      ))}
    </Select>
  );
});

export default observer(function () {
  const { mapStore } = useStore();

  const setRenderType = (type: RenderType) => () => {
    if (type !== mapStore.renderType) {
      mapStore.renderType = type;
      mapStore.render();
    }
  }

  const setGridColorBy = (colorBy: GridColorBy) => () => {
    if (colorBy !== mapStore.gridColorBy) {
      mapStore.gridColorBy = colorBy;
      mapStore.render();
    }
  }

  return (
    <VStack>
      <Flex w="100%" alignItems="center">
        Projection: <Spacer />
        <ProjectionSelect />
      </Flex>
      <Flex w="100%">
        Show
        <Spacer />
        <ButtonGroup variant="outline" isAttached size="sm">
          <Button onClick={setRenderType("raw")} isActive={mapStore.renderType === "raw"}>Records</Button>
          <Button onClick={setRenderType("grid")} isActive={mapStore.renderType === "grid"}>Cells</Button>
        </ButtonGroup>
      </Flex>
      <Flex w="100%">
        Cell colors
        <Spacer />
        <ButtonGroup variant="outline" isAttached size="sm" isDisabled={mapStore.renderType === "raw"}>
          <Button onClick={setGridColorBy("records")} isActive={mapStore.gridColorBy === "records"}>Heatmap</Button>
          <Button onClick={setGridColorBy("modules")} isActive={mapStore.gridColorBy === "modules"}>Bioregions</Button>
        </ButtonGroup>
      </Flex>
    </VStack>
  )
});
