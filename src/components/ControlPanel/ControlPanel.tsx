import { Box } from '@chakra-ui/react';
import Section from './Section';
import Projection from './Projection';
import Resolution from './Resolution';

export default function ControlPanel() {
  return (
    <Box>
      <Section label="Resolution">
        <Resolution />
      </Section>
      <Section label="Map">
        <Projection />
      </Section>
    </Box>
  );
};
