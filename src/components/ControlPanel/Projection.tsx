import { observer } from 'mobx-react';
import { Flex, Spacer, Select } from '@chakra-ui/react';
import { useStore } from '../../store';
import type { Projection } from '../../store/MapStore';
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

export default function () {
  return (
    <Flex alignItems="center">
      Projection: <Spacer />
      <ProjectionSelect />
    </Flex>
  )
}
