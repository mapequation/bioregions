import { useEffect, useRef } from 'react';
import { observer } from 'mobx-react';
import { useStore } from '../store/';

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
    <div>
      <canvas width={width} height={height} ref={canvasRef} />
    </div>
  );
});