import { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react';
import { useStore } from '../store/';
import * as d3 from 'd3';
import zoom from '../utils/zoom';
import * as d3Zoom from 'd3-zoom';
import { select } from 'd3-selection';
import type { PointFeatureCollection } from '../store/SpeciesStore';

interface CanvasDatum {
  width: number;
  height: number;
  radius: number;
}

type WorldMapProps = {
  width?: number;
  height?: number;
};

type RendererProps = {
  ctx: CanvasRenderingContext2D;
};

const LandRenderer = observer(function LandRenderer({ ctx }: RendererProps) {
  return null;
});

export default observer(function WorldMap({
  width = 800,
  height = 600,
}: WorldMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [context, setContext] = useState(null);
  const store = useStore();

  // useEffect(() => {
  //   const onWindowResize = () => {
  //     // console.log(window.innerWidth, window.innerHeight)
  //   };
  //   window.addEventListener('resize', onWindowResize);

  //   return () => window.removeEventListener('resize', onWindowResize);
  // }, []);

  const { land110m, land50m } = store.landStore;
  const { pointCollection } = store.speciesStore;

  const projection = 'geoOrthographic';
  const geoProjection: d3.GeoProjection = d3[projection]().precision(0.1)!;

  const getPath = (ctx: CanvasRenderingContext2D) =>
    d3.geoPath(geoProjection, ctx);

  const getPointRenderer =
    (ctx: CanvasRenderingContext2D) => (points: PointFeatureCollection) => {
      points.features.forEach((point) => {
        const [x, y] = geoProjection(
          point.geometry.coordinates as [number, number],
        )!;
        ctx.fillStyle = 'red';
        ctx.fillRect(x, y, 2, 2);
      });
    };

  const getLandRenderer =
    (ctx: CanvasRenderingContext2D, path: d3.GeoPath) => (land: any) => {
      ctx.clearRect(0, 0, width, height);
      ctx.beginPath();
      path(sphere);
      ctx.fillStyle = 'AliceBlue';
      ctx.fill();
      ctx.beginPath();
      path(land);
      ctx.fillStyle = '#777';
      ctx.fill();
    };

  const canvasZoom = zoom(geoProjection) as d3Zoom.ZoomBehavior<
    HTMLCanvasElement,
    CanvasDatum
  >;
  const sphere: d3.GeoPermissibleObjects = { type: 'Sphere' };

  useEffect(() => {
    if (canvasRef.current === null) {
      return;
    }

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) {
      console.warn('Failed to create context');
      return;
    }

    const path = getPath(ctx);
    const canvas = select<HTMLCanvasElement, any>(canvasRef.current);
    const renderPoints = getPointRenderer(ctx);
    const render = getLandRenderer(ctx, path);

    canvasZoom
      .on('zoom.render', () => render(land110m))
      .on('end.render', () => {
        render(land50m);
        renderPoints(pointCollection);
      });

    canvasZoom(canvas);
    render(land50m);
    renderPoints(pointCollection);

    // console.log('Render land...');
  }, [width, height, land110m, land50m, pointCollection]);

  return (
    <div className="world-map">
      <div>Land loaded: {store.landStore.loaded ? 'true' : 'false'}</div>
      <div>Species loaded: {store.speciesStore.loaded ? 'true' : 'false'}</div>
      <canvas width={width} height={height} ref={canvasRef} />
    </div>
  );
});
