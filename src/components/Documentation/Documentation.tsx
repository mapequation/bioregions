import { Box, Container, Heading } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { useStore } from '../../store';
import Demo from '../Demo';

export default observer(function Documentation() {
  const { documentationStore } = useStore();
  return (
    <Container maxW="container.xl" id="documentation">
      <Heading as="h2">Documentation</Heading>
      <Container>
        <Box>Lorem</Box>
        Lorem ipsum dolor sit amet consectetur adipisicing elit. Explicabo nulla
        laboriosam, recusandae harum quasi dolore corrupti vitae facere quia
        cumque maiores fugit praesentium et quam aliquid? Quia minima numquam
        necessitatibus!
      </Container>
      <Algorithm />
    </Container>
  );
});

const Algorithm = observer(() => {
  const { documentationStore } = useStore();
  if (!documentationStore) {
    return null;
  }
  return <Demo />;
});
