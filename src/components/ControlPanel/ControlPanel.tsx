import { Box, VStack } from '@chakra-ui/react';
import Section from './Section';
import { LoadData, LoadExample } from './Load';
import Resolution from './Resolution';
import Infomap from './Infomap';
import Map from './Map';
import TreeWeight from '../TreeWeight';

export default function ControlPanel() {
  return (
    <Box>
      <Section label="Data">
        <VStack align="stretch">
          <LoadData />
          <LoadExample />
        </VStack>
      </Section>
      <Section label="Resolution">
        <Resolution />
      </Section>
      <Section label="Infomap">
        <Infomap />
      </Section>
      <Section label="Map">
        <Map />
      </Section>
      <Section label="Tree link weight">
        <TreeWeight />
      </Section>
    </Box>
  );
};
