import { useEffect, useRef } from 'react';
import { observer } from 'mobx-react';
import { useStore } from '../store/';
import * as d3 from 'd3';
import zoom from '../utils/zoom';
import * as d3Zoom from 'd3-zoom';
import { select } from 'd3-selection';

interface CanvasDatum {
  width: number;
  height: number;
  radius: number;
}

type WorldMapProps = {
  width?: number;
  height?: number;
};

export default observer(function WorldMap({
  width = 800,
  height = 600,
}: WorldMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const store = useStore();

  // useEffect(() => {
  //   const onWindowResize = () => {
  //     // console.log(window.innerWidth, window.innerHeight)
  //   };
  //   window.addEventListener('resize', onWindowResize);

  //   return () => window.removeEventListener('resize', onWindowResize);
  // }, []);

  const { land110m, land50m } = store.landStore;

  useEffect(() => {
    if (canvasRef.current === null) {
      return;
    }
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) {
      console.warn('Failed to create context');
      return;
    }

    const projectionName = 'geoOrthographic';
    const projection: d3.GeoProjection = d3[projectionName]().precision(0.1)!;

    const path = d3.geoPath(projection, ctx);

    const sphere: d3.GeoPermissibleObjects = { type: 'Sphere' };

    const canvas = select<HTMLCanvasElement, any>(canvasRef.current);

    const render = (land: any) => {
      ctx.clearRect(0, 0, width, height);
      ctx.beginPath();
      path(sphere);
      ctx.fillStyle = 'AliceBlue';
      ctx.fill();
      //ctx.stroke();
      ctx.beginPath();
      path(land);
      ctx.fillStyle = '#777';
      ctx.fill();
      // ctx.beginPath();
      // path(sphere);
      // ctx.stroke();
    };

    const canvasZoom = zoom(projection) as d3Zoom.ZoomBehavior<
      HTMLCanvasElement,
      CanvasDatum
    >;
    canvasZoom
      .on('zoom.render', () => render(land110m))
      .on('end.render', () => render(land50m));

    canvasZoom(canvas);
    render(land50m);

    // d3.select(ctx.canvas).call(canvasZoom),
    //.on('end.render', () => render(land50)),
    // );
    //.node();

    console.log('Render land...');
  }, [width, height, land110m, land50m]);

  console.log('Render WorldMap');
  return (
    <div className="world-map">
      <div>Land loaded: {store.landStore.loaded ? 'true' : 'false'}</div>
      <canvas width={width} height={height} ref={canvasRef} />
    </div>
  );
});
