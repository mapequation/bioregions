import type { BBox, Polygon, Position } from '../../types/geojson';
import { area } from '../geomath';
import type {
  PointFeature,
  GeoFeature,
  PolygonFeature,
  Species,
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
import { calcMedian } from '../math';

export default class Cell
  implements ExtendedFeature<Polygon, QuadtreeNodeProperties> {
  x1: number; // west
  y1: number; // south
  x2: number; // east
  y2: number; // north
  // Unclipped bounds. Nodes split at their unclipped midpoints, so the grid
  // stays dyadic where a visible cell is clipped to the globe (design.md B8).
  readonly bounds: BBox;
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
  // Area of the cell in km². For a remainder cell, the area of its own region:
  // fullArea minus the areas of its emitted descendants.
  area: number;
  // Area of the (clipped) extent in km².
  readonly fullArea: number;
  // Emitted as a grid cell by the last QuadtreeGeoBinner.generateCells.
  isCell: boolean = false;
  id: string = ''; // '0','1',..'3', '00', '01', ..,'33', '000', '001', ...etc
  private _recalcStats: boolean = true;
  private _speciesTopList: { count: number; name: string }[] = [];
  private _speciesRichness: number = 0;
  // @ts-expect-error narrows ExtendedFeature's `type?: string` to the literal 'Feature'
  type = 'Feature';

  constructor(extent: BBox, maxCellSizeLog2: number) {
    this.bounds = [extent[0], extent[1], extent[2], extent[3]];
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
    this.fullArea = this.area;
  }

  /** An internal node emitted as a cell for the records its children passed up. */
  get isRemainder() {
    return this.isCell && !this.isLeaf;
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

  /** Unclipped width in degrees, a power of two (design.md B8). */
  get size() {
    return this.bounds[2] - this.bounds[0];
  }

  /** Unclipped midpoint, where the node splits. */
  get splitPoint(): [number, number] {
    const [x1, y1, x2, y2] = this.bounds;
    return [(x1 + x2) * 0.5, (y1 + y2) * 0.5];
  }

  get sizeLog2() {
    return Math.log2(this.size);
  }

  get sizeString() {
    return this.sizeLog2 < 0 ? `1/${Math.round(2 ** -this.sizeLog2)}˚` : `${this.size}˚`;
  }

  get speciesTopList() {
    if (this._recalcStats) {
      this.calcStats();
    }
    return this._speciesTopList;
  }

  get speciesRichness() {
    if (this._recalcStats) {
      this.calcStats();
    }
    return this._speciesRichness;
  }

  get overlap() {
    const { ownProportion } = this.connectedBioregions;
    return ownProportion;
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

    // In-between size bounds, create children if overflowing density threshold.
    // Redistribute the held features and then the arriving one, so that no
    // record is lost on a split.
    if (this.features.length === nodeCapacity) {
      const held = this.features;
      this.features = [];
      held.forEach((heldFeature) => {
        this.addChild(
          heldFeature,
          maxCellSizeLog2,
          minCellSizeLog2,
          nodeCapacity,
        );
      });
      this.addChild(feature, maxCellSizeLog2, minCellSizeLog2, nodeCapacity);
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
    let [x1, y1, x2, y2] = this.bounds;
    const [xMid, yMid] = this.splitPoint;

    // Recursively insert into the child node.
    this.isLeaf = false;
    const geom = feature.geometry;

    const [x, y] = geom.coordinates;
    // A point on the midline goes east/north, except on the eastern/northern
    // domain edge (lon 180, lat 90): there the east/north child would lie
    // outside the domain and be clamped to zero width, so the point belongs
    // to the last column/row instead.
    const isRight = x > xMid || (x === xMid && xMid < 180);
    const isBelow = y > yMid || (y === yMid && yMid < 90);
    const i = (Number(isBelow) << 1) | Number(isRight);

    // Update the bounds as we recurse.
    if (isRight) x1 = xMid;
    else x2 = xMid;

    if (isBelow) y1 = yMid;
    else y2 = yMid;

    if (this.children[i] === undefined) {
      this.children[i] = new Cell([x1, y1, x2, y2], maxCellSizeLog2);
    }
    const child = this.children[i];

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

    const [x1, y1, x2, y2] = this.bounds;
    const [xm, ym] = this.splitPoint;

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
      // A quadrant off the globe (above a pole row, or east of lon 180) is
      // clipped to zero area and never gets a record.
      if (child.visible && (child.x2 <= child.x1 || child.y2 <= child.y1)) {
        continue;
      }

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
    nonEmptyChildren.forEach((child: Cell) => {
      child
        ?.patchPartiallyEmptyNodes(maxCellSizeLog2)
        ?.forEach((feature) => {
          aggregatedFeatures.push(feature);
        });
    });

    if (doPatch) {
      this.features = aggregatedFeatures; // FIXME
    }

    return aggregatedFeatures;
  }

  /**
   * Decide which nodes of this subtree are emitted as grid cells, bottom-up,
   * so that the cells partition the records (each record is in at most one
   * cell).
   *
   * A leaf with at least `threshold` records is emitted. With `patch`, a leaf
   * that falls short passes its records up to its parent. An adaptive internal
   * node (at most `maxCellSizeLog2` wide) collects the records its children
   * pass up and is emitted as a *remainder cell* if it holds at least
   * `threshold` of them; otherwise it passes them on. A remainder cell's area
   * is its own area minus the areas of its emitted descendants. Records still
   * short at the coarsest adaptive level, and without `patch` the records of
   * sparse leaves, are dropped and counted in `dropped.count`.
   *
   * Only quadrants that hold records take part, so a node clipped at a pole or
   * at lon 180 is not treated as patchy for its off-globe quadrants. A node
   * whose children are all emitted gets no records and is not emitted.
   *
   * Returns the records passed up to the parent and the area claimed by the
   * nearest emitted nodes in this subtree.
   */
  partition(
    maxCellSizeLog2: number,
    threshold: number,
    patch: boolean,
    dropped: { count: number },
  ): { records: GeoFeature[]; claimedArea: number } {
    this._recalcStats = true;
    this.area = this.fullArea;
    this.isCell = false;
    const adaptive = this.sizeLog2 <= maxCellSizeLog2;

    let held: GeoFeature[];
    let claimedArea = 0;
    if (this.isLeaf) {
      held = this.features;
    } else {
      // Records of polygons can be in more than one child; count them once.
      const passedUp = new Set<GeoFeature>();
      for (const child of this.children) {
        if (!child) continue;
        const up = child.partition(maxCellSizeLog2, threshold, patch, dropped);
        claimedArea += up.claimedArea;
        for (const feature of up.records) passedUp.add(feature);
      }
      held = Array.from(passedUp);
      this.features = [];
    }

    if (held.length >= threshold && (this.isLeaf || adaptive)) {
      this.isCell = true;
      this.features = held;
      this.area = Math.max(this.fullArea - claimedArea, 0);
      return { records: [], claimedArea: this.fullArea };
    }
    const isTop = !this.parent || this.parent.sizeLog2 > maxCellSizeLog2;
    if (!patch || isTop) {
      dropped.count += held.length;
      return { records: [], claimedArea };
    }
    return { records: held, claimedArea };
  }

  calcStats() {
    type FeatureName = string;
    type FeatureCount = number;

    const speciesMap: Map<FeatureName, FeatureCount> = new Map();
    for (const feature of this.features) {
      const { name } = feature.properties;
      speciesMap.set(name, (speciesMap.get(name) ?? 0) + 1);
    }

    this._speciesTopList = Array.from(speciesMap.entries())
      .map(([name, count]) => ({ count, name }))
      .sort((a, b) => (a.count > b.count ? -1 : 1));

    this._speciesRichness = speciesMap.size;

    this._recalcStats = false;
  }

  bioregionMetrics = {
    relativeRichness: 0,
    overlap: 0,
    endemicity: 0,
    occupancy: 0,
  }
  calcBioregionStats({
    meanNumSpeciesWithin,
    stddevNumSpeciesWithin,
    meanSpeciesExtentWithin,
    sddevSpeciesExtentWithin,
    speciesMap
  }: {
    meanNumSpeciesWithin: number,
    stddevNumSpeciesWithin: number,
    meanSpeciesExtentWithin: number,
    sddevSpeciesExtentWithin: number,
    speciesMap: Map<string, Species>
  }) {
    const { connectedBioregions, bioregionId } = this;
    const numSpecies = connectedBioregions.flowCount.count;
    const numSpeciesWithin = connectedBioregions.bioregionIds.get(bioregionId)?.count ?? 0;


    this.bioregionMetrics.overlap = numSpecies === 0 ? 0 : (numSpecies - numSpeciesWithin) / numSpecies;
    this.bioregionMetrics.relativeRichness = stddevNumSpeciesWithin < 1e-10 ? 0 : (numSpeciesWithin - meanNumSpeciesWithin) / stddevNumSpeciesWithin;

    const endemicity = this.speciesTopList.map(({ name }) => {
      const species = speciesMap.get(name);
      if (species === undefined) {
        throw new Error(`calcBioregionStats: species '${name}' not found in speciesMap`);
      }
      // `?? NaN` preserves the prior `!`-then-arithmetic behavior: an unset count
      // yielded `undefined`, and `undefined / x` is already NaN.
      return (species.numGridCellsWithinModule ?? NaN) / (species.numGridCells ?? NaN);
    })
    const occupancy = this.speciesTopList.map(({ name }) => {
      const species = speciesMap.get(name);
      if (species === undefined) {
        throw new Error(`calcBioregionStats: species '${name}' not found in speciesMap`);
      }
      return ((species.numGridCellsWithinModule ?? NaN) - meanSpeciesExtentWithin) / sddevSpeciesExtentWithin;
    })
    this.bioregionMetrics.endemicity = calcMedian(endemicity);
    this.bioregionMetrics.occupancy = calcMedian(occupancy);
  }

  find(x: number, y: number, radius?: number): Cell | undefined {
    if (this.isLeaf) {
      return this;
    }
    const [xMid, yMid] = this.splitPoint;

    // Same midline rule as addChildPoint (B2).
    const isRight = x > xMid || (x === xMid && xMid < 180);
    const isBelow = y > yMid || (y === yMid && yMid < 90);
    const i = (Number(isBelow) << 1) | Number(isRight);
    return this.children[i]?.find(x, y, radius) ?? (this.visible ? this : undefined);
  }
}
