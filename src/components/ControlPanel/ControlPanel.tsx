import { Box } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import Section from './Section';
import Resolution from './Resolution';
import Infomap from './Infomap';
import Map from './Map';
import Data from './Data';
import { useStore } from '../../store';

export default observer(function ControlPanel() {
  const { speciesStore } = useStore();

  return (
    <Box>
      <Section label="Data" isLoading={speciesStore.isLoading}>
        <Data />
      </Section>
      <Section label="Resolution" isLoading={speciesStore.isLoading}>
        <Resolution />
      </Section>
      <Section label="Infomap">
        <Infomap />
      </Section>
      <Section label="Map">
        <Map />
      </Section>
    </Box>
  );
});
