import { useEffect, useRef } from 'react';
import { observer } from 'mobx-react';
import { useStore } from '../store/';
// const initialCoordinates = [52.53102, 13.3848];
// const initialZoomLevel = 5;
// const minZoomLevel = 3;
// const maxZoomLevel = 10;

export default observer(function WorldMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const store = useStore();

  useEffect(() => {
    const onWindowResize = () => {
      // console.log(window.innerWidth, window.innerHeight)
    };
    window.addEventListener('resize', onWindowResize);

    return () => window.removeEventListener('resize', onWindowResize);
  }, []);

  useEffect(() => {
    console.log('Render land110m:', store.landStore.land110m);
  }, [store.landStore.land110m]);

  return (
    <div className="WorldMap">
      <div>Land loaded: {store.landStore.loaded ? 'true' : 'false'}</div>
      <canvas ref={canvasRef} />
    </div>
  );
});
