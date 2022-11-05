import { HStack, Text, useColorModeValue, VStack } from '@chakra-ui/react';
import Infomap from '@mapequation/infomap';

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
    <HStack justify="flex-start" align="flex-start" spacing={3}>
      <div style={{ position: 'relative' }}>
        <a href="//mapequation.org" style={{ display: 'block' }}>
          <img
            alt="MapEquation"
            width="32px"
            height="32px"
            src="//www.mapequation.org/assets/img/twocolormapicon_whiteboarder.svg"
          />
        </a>
      </div>
      <VStack w="100%" align="flex-start" pb={1}>
        <Text fontFamily="brand" fontSize="22px" fontWeight={700}>
          <span style={{ color }}>Infomap</span>{' '}
          <span style={{ color: brand }}>Bioregions</span>
          <span style={{ ...styles.version }}>
            {' v' + process.env.REACT_APP_VERSION}
          </span>
        </Text>
        <Text fontSize="xs" fontWeight={300} style={{ marginTop: 1 }}>
          Powered by Infomap v{Infomap.__version__}
        </Text>
      </VStack>
    </HStack>
  );
}
