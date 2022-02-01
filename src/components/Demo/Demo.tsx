import { Box } from '@chakra-ui/react';
import DemoTree from './DemoTree';
import type { DemoTreeProps } from './DemoTree';

export default function Demo(props: DemoTreeProps) {
  return (
    <Box w="100%">
      <DemoTree {...props} />
    </Box>
  );
}
