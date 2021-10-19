import { Box } from '@chakra-ui/react';
import Section from './Section';
import Load from './Load';
import Resolution from './Resolution';
import Map from './Map';

export default function ControlPanel() {
  return (
    <Box>
      <Section label="Load data">
        <Load />
      </Section>
      <Section label="Resolution">
        <Resolution />
      </Section>
      <Section label="Map">
        <Map />
      </Section>
    </Box>
  );
};
