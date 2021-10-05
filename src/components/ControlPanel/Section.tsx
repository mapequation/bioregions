import React from 'react';
import { Box, Heading } from '@chakra-ui/react';

const Section = ({
  label,
  children,
}: React.PropsWithChildren<{ label: string }>) => (
  <Box
    border="gray.800"
    borderWidth={1}
    rounded="md"
    shadow="base"
    px={4}
    py={4}
    mt={4}
    w="300px"
    minW="200px"
  >
    <Box pos="relative" zIndex={1}>
      <Heading
        as="h5"
        size="xs"
        fontWeight="semibold"
        textTransform="uppercase"
        pos="absolute"
        top="-6"
        bg="white"
        px={2}
      >
        {label}
      </Heading>
    </Box>
    {children}
  </Box>
);

export default Section;
