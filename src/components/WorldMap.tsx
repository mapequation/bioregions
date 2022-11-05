import { useEffect, useRef } from 'react';
import { observer } from 'mobx-react';
import { useStore } from '../store/';
import { Box } from '@chakra-ui/react';

type WorldMapProps = {
  width?: number;
  height?: number;
};

export default observer(function WorldMap({
  width = 800,
  height = 600,
}: WorldMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { mapStore } = useStore();

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
