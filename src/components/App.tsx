import TreeWeight from './TreeWeight';
import WorldMap from './WorldMap';

import { useStore } from '../store';
import { Select } from '@chakra-ui/react';
import type { Projection } from '../store/MapStore';
import { PROJECTIONS } from '../store/MapStore';

function ProjectionSelect() {
  const { mapStore } = useStore();

  return (
    <Select
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
}

export default function App() {
  return (
    <>
      <h1>Infomap Bioregions</h1>

      <ProjectionSelect />
      <WorldMap />
      <TreeWeight />
    </>
  );
}
