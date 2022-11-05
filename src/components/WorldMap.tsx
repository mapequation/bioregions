import { useEffect, useRef } from 'react';
import { observer } from 'mobx-react';
import { useStore } from '../store/';
import { Box } from '@chakra-ui/react';

export default observer(function WorldMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { mapStore } = useStore();
  const { width, height } = mapStore;

  useEffect(() => {
    if (canvasRef.current === null) {
      return;
    }

    mapStore.setCanvas(canvasRef.current);
  }, [mapStore]);

  return (
    <Box ml={4}>
      <canvas width={width} height={height} ref={canvasRef} />
    </Box>
  );
});
