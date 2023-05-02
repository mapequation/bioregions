import { BBox, Polygon, Position } from '../../types/geojson';
import { area } from '../geomath';
import type {
  PointFeature,
  GeoFeature,
  PolygonFeature,
} from '../../store/SpeciesStore';
import type { ExtendedFeature } from 'd3';
import OverlappingBioregions from './OverlappingBioregions';
import ConnectedBioregions from './ConnectedBioregions';
import type {
  QuadtreeNodeProperties,
  VisitCallback,
} from './QuadTreeGeoBinner';
import * as turf from '@turf/turf';
import booleanIntersects from '@turf/boolean-intersects';
import { CellColor } from '../../store/ColorStore';

export default class Cell
  implements ExtendedFeature<Polygon, QuadtreeNodeProperties>
{
  x1: number; // west
  y1: number; // south
  x2: number; // east
  y2: number; // north
  visible: boolean;
  isLeaf: boolean = true;
  features: GeoFeature[] = [];
  parent: Cell | null = null;
  private children: [
    Cell | undefined,
    Cell | undefined,
    Cell | undefined,
    Cell | undefined,
  ] = [undefined, undefined, undefined, undefined];
  bioregionId: number = 0;
  overlappingBioregions: OverlappingBioregions = new OverlappingBioregions();
  connectedBioregions: ConnectedBioregions = new ConnectedBioregions();
  color: string = "#ffcccccc";
  path: number[] = [];
  area: number;
  id: string = ''; // '0','1',..'3', '00', '01', ..,'33', '000', '001', ...etc
  private _recalcStats: boolean = true;
  private _speciesTopList: { count: number; name: string }[] = [];
  // @ts-ignore
  type = 'Feature';

  constructor(extent: BBox, maxCellSizeLog2: number) {
    this.x1 = extent[0];
    this.y1 = extent[1];
    this.x2 = extent[2];
    this.y2 = extent[3];

    this.visible = this.sizeLog2 <= maxCellSizeLog2;

    if (this.visible) {
      this.x1 = Math.max(this.x1, -180);
      this.x2 = Math.min(this.x2, 180);
      this.y1 = Math.max(this.y1, -90);
      this.y2 = Math.min(this.y2, 90);
    }

    this.area = area(this.extent);
  }

  get _children() {
    return this.children;
  }

  getModule(level: number): string {
    const min = Math.min(level, this.path.length - 1);
    return this.path.slice(0, min).join(':');
  }

  get recordsPerArea() {
    return this.features.length / this.area;
  }

  get numFeatures() {
    return this.features.length;
  }

  get properties(): QuadtreeNodeProperties {
    return {
      numRecords: this.features.length,
      features: this.features,
    };
  }

  get geometry(): Polygon {
    /*
    x1,y2_______x2,y2
        |       |
        |       |
        |       | 
        |_______| 
    x1,y1  ->   x2,y1
    */
    return {
      type: 'Polygon',
      coordinates: this.coordinates,
    };
  }

  get coordinates(): Position[][] {
    return [
      [
        [this.x1, this.y1],
        [this.x1, this.y2],
        [this.x2, this.y2],
        [this.x2, this.y1],
        [this.x1, this.y1],
      ],
    ];
  }

  get geometries(): Polygon[] {
    return [this.geometry];
  }

  get extent(): BBox {
    return [this.x1, this.y1, this.x2, this.y2];
  }

  get center(): [number, number] {
    return [(this.x1 + this.x2) / 2, (this.y1 + this.y2) / 2];
  }

  get size() {
    return this.x2 - this.x1;
  }

  get sizeLog2() {
    return Math.log2(this.size);
  }

  get speciesTopList() {
    if (this._recalcStats) {
      this.calcStats();
    }
    return this._speciesTopList;
  }

  add(
    feature: GeoFeature,
    maxCellSizeLog2: number,
    minCellSizeLog2: number,
    nodeCapacity: number,
  ) {
    this._recalcStats = true;

    if (!this.isLeaf) {
      return this.addChild(
        feature,
        maxCellSizeLog2,
        minCellSizeLog2,
        nodeCapacity,
      );
    }

    // Force create children
    if (this.sizeLog2 > maxCellSizeLog2) {
      return this.addChild(
        feature,
        maxCellSizeLog2,
        minCellSizeLog2,
        nodeCapacity,
      );
    }

    // Allow no more children
    if (this.sizeLog2 <= minCellSizeLog2) {
      return this.features.push(feature);
    }

    // In-between size bounds, create children if overflowing density threshold
    if (this.features.length === nodeCapacity) {
      this.features.forEach((feature) =>
        this.addChild(feature, maxCellSizeLog2, minCellSizeLog2, nodeCapacity),
      );
      this.features = [];
    } else {
      this.features.push(feature);
    }
  }

  // Recursively inserts the specified point or polygon into descendants of
  // this node.
  private addChild(
    feature: GeoFeature,
    maxCellSizeLog2: number,
    minCellSizeLog2: number,
    nodeCapacity: number,
  ) {
    if (feature.geometry.type === 'Point') {
      this.addChildPoint(
        feature as PointFeature,
        maxCellSizeLog2,
        minCellSizeLog2,
        nodeCapacity,
      );
    } else if (feature.geometry.type === 'Polygon') {
      this.addChildPolygon(
        feature as PolygonFeature,
        maxCellSizeLog2,
        minCellSizeLog2,
        nodeCapacity,
      );
    } else if (feature.geometry.type === 'MultiPolygon') {
      feature.geometry.coordinates.forEach((coordinates) => {
        const feat = {
          geometry: {
            type: 'Polygon',
            coordinates,
          },
          properties: feature.properties,
        } as PolygonFeature;
        this.addChildPolygon(
          feat,
          maxCellSizeLog2,
          minCellSizeLog2,
          nodeCapacity,
        );
      });
    } else {
      throw new Error(`Unsupported geometry type: ${feature.geometry.type}`);
    }
  }

  private addChildPoint(
    feature: PointFeature,
    maxCellSizeLog2: number,
    minCellSizeLog2: number,
    nodeCapacity: number,
  ) {
    // Compute the split point, and the quadrant in which to insert the point.
    let { x1, x2, y1, y2 } = this;
    const xMid = (x1 + x2) * 0.5;
    const yMid = (y1 + y2) * 0.5;

    // Recursively insert into the child node.
    this.isLeaf = false;
    const geom = feature.geometry;

    const [x, y] = geom.coordinates;
    const isRight = x >= xMid;
    const isBelow = y >= yMid;
    const i = (Number(isBelow) << 1) | Number(isRight);

    // Update the bounds as we recurse.
    if (isRight) x1 = xMid;
    else x2 = xMid;

    if (isBelow) y1 = yMid;
    else y2 = yMid;

    const child =
      this.children[i] ??
      (this.children[i] = new Cell([x1, y1, x2, y2], maxCellSizeLog2));

    child.parent = this;
    child.id = `${this.id}${i}`;

    child.add(feature, maxCellSizeLog2, minCellSizeLog2, nodeCapacity);
  }

  addChildPolygon(
    feature: PolygonFeature,
    maxCellSizeLog2: number,
    minCellSizeLog2: number,
    nodeCapacity: number,
  ) {
    /**
     * Strategy
     * 1. Check if bbox overlap
     * 2. If true, check if polygon overlap is all, partial or none
     * 3. Check if more species than capacity
     * 4. If true, subdivide
     * 4. If subdivide, for each polygon in parent:
     *    if overlap is all, add overlap all to all children
     *    else check if polygon overlap is all, partial or none
     */
    if (!feature.bbox) {
      feature.bbox = turf.bbox(feature.geometry);
    }

    const { x1, y1, x2, y2 } = this;
    const xm = (x1 + x2) * 0.5;
    const ym = (y1 + y2) * 0.5;

    const topLeft = turf.polygon([
      [
        [x1, ym],
        [xm, ym],
        [xm, y2],
        [x1, y2],
        [x1, ym],
      ],
    ]);
    const topRight = turf.polygon([
      [
        [xm, ym],
        [x2, ym],
        [x2, y2],
        [xm, y2],
        [xm, ym],
      ],
    ]);
    const lowerLeft = turf.polygon([
      [
        [x1, y1],
        [xm, y1],
        [xm, ym],
        [x1, ym],
        [x1, y1],
      ],
    ]);
    const lowerRight = turf.polygon([
      [
        [xm, y1],
        [x2, y1],
        [x2, ym],
        [xm, ym],
        [xm, y1],
      ],
    ]);
    const subPolygons = [topLeft, topRight, lowerLeft, lowerRight];

    const getChild = (i: number) => {
      let child = this.children[i];
      if (!child) {
        const points = subPolygons[i].geometry.coordinates[0];
        const [x1, y1, x2, y2] = [
          points[0][0],
          points[0][1],
          points[2][0],
          points[2][1],
        ];
        child = new Cell([x1, y1, x2, y2], maxCellSizeLog2);
      }
      return child;
    };

    const addChild = (i: number, child: Cell) => {
      this.children[i] = child;
      child.parent = this;
      child.id = `${this.id}${i}`;
    };

    for (let i = 0; i < 4; ++i) {
      const child = getChild(i);

      if (booleanIntersects(child.geometry, feature.geometry)) {
        if (!this.children[i]) {
          addChild(i, child);
        }
        child.add(feature, maxCellSizeLog2, minCellSizeLog2, nodeCapacity);
      }
    }
  }

  visitNonEmpty(callback: VisitCallback) {
    if (this.features.length > 0) {
      if (callback(this)) return; // early exit if callback returns true
    }
    for (let i = 0; i < 4; ++i) this.children[i]?.visitNonEmpty(callback);
  }

  visit(callback: VisitCallback) {
    if (callback(this)) return; // early exit if callback returns true
    for (let i = 0; i < 4; ++i) this.children[i]?.visit(callback);
  }

  patchPartiallyEmptyNodes(maxCellSizeLog2: number) {
    if (this.isLeaf) return this.features;

    // Already patched if features at non-leaf node.
    if (this.features.length > 0) {
      return this.features;
    }

    const nonEmptyChildren: Cell[] = this.children.filter(
      (child) => child !== undefined,
    ) as Cell[];

    const doPatch =
      this.sizeLog2 <= maxCellSizeLog2 &&
      this.features.length === 0 &&
      nonEmptyChildren.length < 4;

    const aggregatedFeatures: GeoFeature[] = []; // FIXME changed from PointFeature
    nonEmptyChildren.forEach((child: Cell) =>
      child
        ?.patchPartiallyEmptyNodes(maxCellSizeLog2)
        ?.forEach((feature) => aggregatedFeatures.push(feature)),
    );

    if (doPatch) {
      // @ts-ignore
      this.features = aggregatedFeatures; // FIXME
    }

    return aggregatedFeatures;
  }

  patchSparseNodes(maxCellSizeLog2: number, lowerThreshold: number) {
    if (this.isLeaf) return this.features;

    // Already patched if features at non-leaf node.
    if (this.features.length > 0) {
      return this.features;
    }

    const nonEmptyChildren = this.children.filter(
      (child) => child !== undefined,
    );
    const sparseChildren = nonEmptyChildren.filter(
      (child) => child?.isLeaf && child.features.length < lowerThreshold,
    );

    const doPatch =
      this.sizeLog2 <= maxCellSizeLog2 &&
      (nonEmptyChildren.length < 4 || sparseChildren.length > 0);

    const aggregatedFeatures: GeoFeature[] = []; // FIXME changed from PointFeature
    nonEmptyChildren.forEach((child) =>
      child
        ?.patchSparseNodes(maxCellSizeLog2, lowerThreshold)
        ?.forEach((feature) => aggregatedFeatures.push(feature)),
    );

    if (doPatch) {
      this.features = aggregatedFeatures;
    }

    return aggregatedFeatures;
  }

  calcStats() {
    type FeatureName = string;
    type FeatureCount = number;

    const speciesMap: Map<FeatureName, FeatureCount> = new Map();
    for (let feature of this.features) {
      const { name } = feature.properties;
      speciesMap.set(name, (speciesMap.get(name) ?? 0) + 1);
    }

    this._speciesTopList = Array.from(speciesMap.entries())
      .map(([name, count]) => ({ count, name }))
      .sort((a, b) => (a.count > b.count ? -1 : 1));

    this._recalcStats = false;
  }
}
