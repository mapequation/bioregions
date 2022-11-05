import { Container, Heading, useColorModeValue } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { useStore } from '../../store';
import Demo from '../Demo';

export default observer(function Documentation() {
  // const { documentationStore } = useStore();
  const color = useColorModeValue('hsl(0, 0%, 33%)', 'hsl(0, 0%, 60%)');
  return (
    <Container alignItems="flex-start" maxW="container.xl" id="documentation">
      <Heading as="h2" fontFamily="brand" color={color}>
        Documentation
      </Heading>
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
