import {
  Container,
  HStack,
  VStack,
  Heading,
  useColorModeValue,
  Box,
} from '@chakra-ui/react';
import { observer } from 'mobx-react';
import WorldMap from './WorldMap';
import ControlPanel from './ControlPanel';
import Tree from './Tree';
import { useStore } from '../store';
import Statistics from './Statistics';
import Logo from './ControlPanel/Logo';

export default observer(function App() {
  const { treeStore } = useStore();
  const treeColor = useColorModeValue('#666666', '#eeeeee');
  const bg = useColorModeValue(
    "#F5F2F0 url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAACHUlEQVQ4T1XUCW5bMQwEUMn7cv8btmnqxLGT1vui4AkY4EeA8BeRwyGHVN38+d3G43GxW2tlMpmU2+1Wns9nWSwW5Xg8ltFoVB6PR7FWq1V/v1wuZTqdltls1r/v93v3qW+vLy1G1+u1gzLMYhgnjvZ6vS6Hw6HUWrv9fD7v7+fzudTPj/eG0XK57GzCCojNUUBngDgBAczndDr1ZzKsUpamH2EACDPgngCkLTA2QNjLRABPDPs+fO2b6Fg4BAbAO+dhPdVIWRCwwkpQAe263bw2yD7ChKOoDLEG4Okc6wTzz3vE6gx375sWhTgC4ugQOyuMvLNlk/SjtjLIrn7ttl2U1ISBVKXGEVuLje+0SECdC4hEb5v/n7sG3QdQikVJQAHkpCypl7P0J3AYylH/vvxqXoYNnTZK6tgKZqUTiJgSCGr3ftxv37ooqQkj32mXGEZ5QMoS4aJ6MuwqY+iHFBgDV2DGomKvwaUWgdIBAgjGtquc0UsPpiUAAx32oToBTHAEYhO1e8qZW3XS5EN1h+OFReo4nJxhRn30oqzotnQsABikPhFEwPRr1I5P/bf/6KOXuY2a6UdMpJoejBjqlbbiw74LShSFV3SgDqWAqUC5NHIGMO2k3rLzD/s+KQAZOJBiqOfSjVPEyiWQWvNxraU7+qRgl5+ZDE8tkbFMegDCVpAMxI/bRsqYOcwtDAjzlCA3cxpZTaN67k4kvgH79HB6cJuWywAAAABJRU5ErkJggg==')",
    '#1A202C',
  );
  // <Box sx={{ bg, backgroundSize: '10px 10px' }}>
  return (
    <Box>
      <Container maxW="container.xl" pb={12}>
        <Heading as="h1" size="xl" color="gray.700">
          <Logo />
        </Heading>
        <HStack spacing="30px" alignItems="flex-start">
          <ControlPanel />
          <VStack flex={1}>
            <WorldMap />
            {treeStore.treeString != null && (
              <Tree
                source={treeStore.treeString}
                size={{ width: 600, height: 400 }}
                showLabels
                showLeafLabels
                interactive
                fillColour={treeColor}
                strokeColour={treeColor}
                fontColour={treeColor}
              />
            )}
            <Statistics />
          </VStack>
        </HStack>
      </Container>
    </Box>
  );
});
