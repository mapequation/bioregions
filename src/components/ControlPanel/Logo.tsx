import { Box, HStack, Text, VStack } from '@chakra-ui/react';
import { useColorModeValue } from '../ui/color-mode';
import Infomap from '@mapequation/infomap';
import { version as d3glVersion } from '@mapequation/d3gl';

export default function Logo() {
  const color = useColorModeValue('hsl(0, 0%, 33%)', 'hsl(0, 0%, 60%)');
  const brand = useColorModeValue('hsl(0, 68%, 42%)', 'hsl(0, 68%, 62%)');
  const version = useColorModeValue('hsl(0, 0%, 50%)', 'hsl(0, 0%, 40%)');

  const styles = {
    version: {
      color: version,
      fontSize: 12,
      marginLeft: 4,
    },
  };

  return (
    <HStack justify="flex-start" align="flex-start" gap={3}>
      <Box position="relative">
        <a href="//mapequation.org" style={{ display: 'block' }}>
          <img
            alt="MapEquation"
            width="32px"
            height="32px"
            src="/bioregions/twocolormapicon_whiteboarder.svg"
          />
        </a>
      </Box>
      <VStack w="100%" align="flex-start" pb={1} gap={0}>
        <Text fontFamily="brand" fontSize="22px" fontWeight={700}>
          <span style={{ color }}>Infomap</span>{' '}
          <span style={{ color: brand }}>Bioregions</span>
          <span style={{ ...styles.version }}>{` v${__APP_VERSION__}`}</span>
        </Text>
        <Text fontSize="xs" lineHeight="shorter" fontWeight={300}>
          Powered by{' '}
          <a href="//mapequation.org/infomap">Infomap v{Infomap.__version__}</a>{' '}
          and <a href="//mapequation.org/d3gl">d3gl v{d3glVersion}</a>
        </Text>
      </VStack>
    </HStack>
  );
}
