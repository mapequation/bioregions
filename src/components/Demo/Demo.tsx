import { observer } from 'mobx-react';
import {
  Box,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
} from '@chakra-ui/react';
import DemoTree from './DemoTree';
import { useDemoStore } from '../../store';

export default observer(() => {
  const demoStore = useDemoStore();
  const { treeStore, infomapStore } = demoStore;
  const { tree } = treeStore;

  if (!tree) {
    return null;
  }

  const { integrationTime, segregationTime } = infomapStore;

  return (
    <Box w="100%">
      <DemoTree
        tree={tree}
        segregationTime={segregationTime}
        integrationTime={integrationTime}
      />
      <Slider
        min={0}
        max={1}
        step={0.01}
        value={segregationTime}
        onChange={infomapStore.setSegregationTime}
        colorScheme="red"
      >
        <SliderTrack>
          <SliderFilledTrack />
        </SliderTrack>
        <SliderThumb />
      </Slider>
      <Slider
        isReversed
        min={0}
        max={1}
        step={0.01}
        value={1 - integrationTime}
        onChange={(value) => infomapStore.setIntegrationTime(1 - value)}
        colorScheme="blue"
      >
        <SliderTrack>
          <SliderFilledTrack />
        </SliderTrack>
        <SliderThumb />
      </Slider>
    </Box>
  );
});
