import { Container, HStack, VStack, Heading } from '@chakra-ui/react';
import WorldMap from './WorldMap';
import ControlPanel from './ControlPanel';

export default function App() {
  return (
    <Container maxW="container.xl">
      <Heading as="h1" size="xl" color="gray.700">
        Infomap Bioregions
      </Heading>

      <HStack spacing="30px" alignItems="flex-start">
        <ControlPanel />
        <VStack flex={1}>
          <WorldMap />
        </VStack>
      </HStack>
    </Container>
  );
}
