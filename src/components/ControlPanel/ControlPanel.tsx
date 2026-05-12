import { Box, Heading } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import Section from './Section';
import Resolution from './Resolution';
import Infomap from './Infomap';
import Map from './Map';
import Data from './Data';
import Export from './Export';
import Advanced from './Advanced';
import { useStore } from '../../store';
import Logo from './Logo';

export const controlPanelWidth = 350;

export default observer(function ControlPanel() {
  const { speciesStore } = useStore();

  return (
    <Box
      position="fixed"
      bottom="0"
      left="0"
      width={controlPanelWidth}
      height="100%"
      // bg={bg}
      zIndex="1"
      overflowY="scroll"
      boxShadow="2xl"
      p={4}
      pb={10}
    >
      <Heading as="h1" size="xl" color="gray.700" pb={2}>
        <Logo />
      </Heading>
      <Section label="Data">
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
      <Section label="Export">
        <Export />
      </Section>
      <Section label="Advanced">
        <Advanced />
      </Section>
    </Box>
  );
});
