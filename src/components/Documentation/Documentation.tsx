import { Box, Container, Heading } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { useStore } from '../../store';
import Demo from '../Demo';

export default observer(function Documentation() {
  const { documentationStore } = useStore();
  return (
    <Container maxW="container.xl" id="documentation">
      <Heading as="h2">Documentation</Heading>
      <Container></Container>
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
