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
  ctx?: CanvasRenderingContext2D | null;
  width: number;
  height: number;
};

const LandRenderer = observer(function LandRenderer({
  ctx,
  width,
  height,
}: RendererProps) {
  const { projectionStore, landStore, speciesStore } = useStore();

  if (ctx == null) {
    return null;
  }

  const { land110m, land50m } = landStore;
  const { projection } = projectionStore;

  const { pointCollection } = speciesStore;

  const path = d3.geoPath(projection, ctx);
  const sphere: d3.GeoPermissibleObjects = { type: 'Sphere' };

  const renderPoints = (points: PointFeatureCollection) =>
    points.features.forEach((point) => {
      const [x, y] = projection(
        point.geometry.coordinates as [number, number],
      )!;
      ctx.fillStyle = 'red';
      ctx.fillRect(x, y, 2, 2);
    });

  const render = (land: any) => {
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

  if (projectionStore.isZooming) {
    render(land110m);
  } else {
    render(land50m);
    renderPoints(pointCollection);
  }

  return null;
});

export default observer(function WorldMap({
  width = 800,
  height = 600,
}: WorldMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [context, setContext] = useState<CanvasRenderingContext2D | null>(null);
  const { projectionStore } = useStore();

  useEffect(() => {
    if (canvasRef.current === null) {
      return;
    }

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) {
      console.warn('Failed to create context');
      return;
    }

    setContext(ctx);

    const canvasZoom = zoom(projectionStore.projection) as d3Zoom.ZoomBehavior<
      HTMLCanvasElement,
      CanvasDatum
    >;

    const canvas = select<HTMLCanvasElement, any>(canvasRef.current);

    canvasZoom
      .on('zoom.render', () => projectionStore.onZoom())
      .on('end.render', () => projectionStore.onZoomEnd());

    canvasZoom(canvas);
  }, [projectionStore]);

  return (
    <div className="world-map">
      <canvas width={width} height={height} ref={canvasRef} />
      <LandRenderer ctx={context} width={width} height={height} />
    </div>
  );
});
