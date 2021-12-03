import { Box } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { useStore } from '../../store';
import { range } from 'd3';

export default observer(function Statistics() {
  const { infomapStore, colorStore } = useStore();

  const { colorBioregion } = colorStore;
  const { numBioregions } = infomapStore;
  // const { binner } = speciesStore;
  // const { cells } = binner;

  return (
    <div>
      {range(numBioregions).map((bioregionId: number) => (
        <Box key={bioregionId} mt={1}>
          <div
            style={{
              width: 100,
              height: 20,
              backgroundColor: colorBioregion(bioregionId),
            }}
          />
        </Box>
      ))}
    </div>
  );
});
