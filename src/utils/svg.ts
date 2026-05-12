import { GeoProjection } from 'd3';
import type Cell from './QuadTree/Cell';

export function getSVGRenderer(projection: GeoProjection) {
  return (d: Cell) =>
    'M' +
    [
      [d.x1, d.y1],
      [d.x2, d.y1],
      [d.x2, d.y2],
      [d.x1, d.y2],
    ]
      // @ts-ignore
      .map((point) => projection(point))
      .join('L') +
    'Z';
}
