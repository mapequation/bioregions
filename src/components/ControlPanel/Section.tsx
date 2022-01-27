import React from 'react';
import {
  Box,
  Heading,
  Spinner,
  Flex,
  useColorModeValue,
} from '@chakra-ui/react';

const Section = ({
  label,
  children,
  isLoading = false,
}: React.PropsWithChildren<{ label: string; isLoading?: boolean }>) => {
  const bg = useColorModeValue('white', 'gray.800');

  return (
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
      pos="relative"
    >
      {isLoading && (
        <Flex
          zIndex={1}
          pos="absolute"
          left={0}
          top={0}
          w="100%"
          h="100%"
          align="center"
          justify="center"
        >
          <Spinner size="lg" />
        </Flex>
      )}
      <Box pos="relative" zIndex={1}>
        <Heading
          as="h5"
          size="xs"
          fontWeight="semibold"
          textTransform="uppercase"
          pos="absolute"
          top="-6"
          bg={bg}
          px={2}
        >
          {label}
        </Heading>
      </Box>
      {children}
    </Box>
  );
};

export default Section;
