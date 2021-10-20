import { Box, VStack } from '@chakra-ui/react';
import Section from './Section';
import { LoadData, LoadExample } from './Load';
import Resolution from './Resolution';
import Map from './Map';
import TreeWeight from '../TreeWeight';

export default function ControlPanel() {
  return (
    <Box>
      <Section label="Load data">
        <VStack align="stretch">
          <LoadData />
          <LoadExample />
        </VStack>
      </Section>
      <Section label="Resolution">
        <Resolution />
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
