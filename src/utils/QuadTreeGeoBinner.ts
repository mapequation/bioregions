import { GeoProjection } from 'd3';
import { BBox, Feature, GeoJsonProperties, Polygon, Point } from 'geojson';
import { area } from './geomath';

type VisitCallback = (node: Node) => true | void;

export interface SpeciesProperties {
  species: string;
  [key: string]: any;
}

type SpeciesFeature = Feature<Point, SpeciesProperties>;

export class Node implements Feature<Polygon> {
  x1: number; // west
  y1: number; // south
  x2: number; // east
  y2: number; // north
  visible: boolean;
  isLeaf: boolean = true;
  features: SpeciesFeature[] = [];
  parent: Node | null = null;
  private children: [
    Node | undefined,
    Node | undefined,
    Node | undefined,
    Node | undefined,
  ] = [undefined, undefined, undefined, undefined];
  clusterId: number = -1;
  path: number[] = [];
  area: number;
  id: string = ''; // '0','1',..'3', '00', '01', ..,'33', '000', '001', ...etc
  private _recalcStats: boolean = true;
  private _speciesTopList: { count: number; species: string }[] = [];
  // @ts-ignore
  type = 'Feature';

  constructor(extent: BBox, maxNodeSizeLog2: number) {
    this.x1 = extent[0];
    this.y1 = extent[1];
    this.x2 = extent[2];
    this.y2 = extent[3];

    this.visible = this.sizeLog2 <= maxNodeSizeLog2;

    if (this.visible) {
      this.x1 = Math.max(this.x1, -180);
      this.x2 = Math.min(this.x2, 180);
      this.y1 = Math.max(this.y1, -90);
      this.y2 = Math.min(this.y2, 90);
    }

    this.area = area(this.extent);
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

  get properties(): GeoJsonProperties {
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
      coordinates: [
        [
          [this.x1, this.y1],
          [this.x2, this.y1],
          [this.x2, this.y2],
          [this.x1, this.y2],
          [this.x1, this.y1],
        ],
      ],
    };
  }

  get extent(): BBox {
    return [this.x1, this.y1, this.x2, this.y2];
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
    feature: SpeciesFeature,
    maxNodeSizeLog2: number,
    minNodeSizeLog2: number,
    nodeCapacity: number,
  ) {
    this._recalcStats = true;

    if (!this.isLeaf) {
      return this.addChild(
        feature,
        maxNodeSizeLog2,
        minNodeSizeLog2,
        nodeCapacity,
      );
    }

    // Force create children
    if (this.sizeLog2 > maxNodeSizeLog2) {
      return this.addChild(
        feature,
        maxNodeSizeLog2,
        minNodeSizeLog2,
        nodeCapacity,
      );
    }

    // Allow no more children
    if (this.sizeLog2 <= minNodeSizeLog2) {
      return this.features.push(feature);
    }

    // In-between size bounds, create children if overflowing density threshold
    if (this.features.length === nodeCapacity) {
      this.features.forEach((feature) =>
        this.addChild(feature, maxNodeSizeLog2, minNodeSizeLog2, nodeCapacity),
      );
      this.features = [];
    } else {
      this.features.push(feature);
    }
  }

  // Recursively inserts the specified point or polygon into descendants of
  // this node.
  private addChild(
    feature: SpeciesFeature,
    maxNodeSizeLog2: number,
    minNodeSizeLog2: number,
    nodeCapacity: number,
  ) {
    // Compute the split point, and the quadrant in which to insert the point.
    let { x1, x2, y1, y2 } = this;
    const xMid = (x1 + x2) * 0.5;
    const yMid = (y1 + y2) * 0.5;

    // Recursively insert into the child node.
    this.isLeaf = false;
    const geom = feature.geometry;

    if (geom.type === 'Point') {
      const [x, y] = geom.coordinates;
      const isRight = x >= xMid;
      const isBelow = y >= yMid;
      // @ts-ignore
      const i = (isBelow << 1) | isRight;

      // Update the bounds as we recurse.
      if (isRight) x1 = xMid;
      else x2 = xMid;

      if (isBelow) y1 = yMid;
      else y2 = yMid;

      const child =
        this.children[i] ??
        (this.children[i] = new Node([x1, y1, x2, y2], maxNodeSizeLog2));

      child.parent = this;
      child.id = `${this.id}${i}`;

      child.add(feature, maxNodeSizeLog2, minNodeSizeLog2, nodeCapacity);
    } else {
      console.error(`Binning geometry of type ${geom.type} not implemented`);
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

  patchPartiallyEmptyNodes(maxNodeSizeLog2: number) {
    if (this.isLeaf) return this.features;

    // Already patched if features at non-leaf node.
    if (this.features.length > 0) {
      return this.features;
    }

    const nonEmptyChildren: Node[] = this.children.filter(
      (child) => child !== undefined,
    ) as Node[];

    const doPatch =
      this.sizeLog2 <= maxNodeSizeLog2 &&
      this.features.length === 0 &&
      nonEmptyChildren.length < 4;

    const aggregatedFeatures: SpeciesFeature[] = [];
    nonEmptyChildren.forEach((child: Node) =>
      child
        ?.patchPartiallyEmptyNodes(maxNodeSizeLog2)
        ?.forEach((feature) => aggregatedFeatures.push(feature)),
    );

    if (doPatch) {
      // @ts-ignore
      this.features = aggregatedFeatures; // FIXME
    }

    return aggregatedFeatures;
  }

  patchSparseNodes(maxNodeSizeLog2: number, lowerThreshold: number) {
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
      this.sizeLog2 <= maxNodeSizeLog2 &&
      (nonEmptyChildren.length < 4 || sparseChildren.length > 0);

    const aggregatedFeatures: SpeciesFeature[] = [];
    nonEmptyChildren.forEach((child) =>
      child
        ?.patchSparseNodes(maxNodeSizeLog2, lowerThreshold)
        ?.forEach((feature) => aggregatedFeatures.push(feature)),
    );

    if (doPatch) {
      this.features = aggregatedFeatures;
    }

    return aggregatedFeatures;
  }

  calcStats() {
    const speciesMap: Map<string, number> = new Map();
    for (let feature of this.features) {
      const { species } = feature.properties;
      speciesMap.set(species, (speciesMap.get(species) ?? 0) + 1);
    }

    this._speciesTopList = Array.from(speciesMap.entries())
      .map(([species, count]) => ({ count, species }))
      .sort((a, b) => (a.count > b.count ? -1 : 1));

    this._recalcStats = false;
  }
}

/**
 * Quadtree GeoJSON binner
 * @TODO: Support polygon types (assume point types now)
 */
export class QuadtreeGeoBinner {
  private _extent: BBox = [-256, -256, 256, 256]; // power of 2 to get 1x1 degree grid cells
  maxNodeSizeLog2: number = 4;
  minNodeSizeLog2: number = 0;
  nodeCapacity: number = 10;
  lowerThreshold: number = 0;
  root: Node | null = null;
  private _scale: number = 1; // Set to 60 to have sizes subdivided to eventually one minute

  constructor() {
    this.initExtent();
    this.initRoot();
  }

  private initExtent() {
    // power of 2 from unscaled unit
    let size = Math.pow(2, this.maxNodeSizeLog2) / this.scale;
    while (size <= 180) {
      size *= 2;
    }
    this.extent = [-size, -size, size, size];
  }

  private initRoot() {
    this.root = new Node(this.extent, this.maxNodeSizeLog2);
  }

  /**
   * Set to 60 to have sizes subdivided to eventually one minute.
   */
  get scale() {
    return this._scale;
  }

  set scale(scale: number) {
    this._scale = scale;
    this.initExtent();
    this.initRoot();
  }

  setScale(scale: number) {
    this.scale = scale;
    return this;
  }

  get extent() {
    return this._extent;
  }

  set extent(extent: BBox) {
    // Squarify the bounds.
    let [x1, y1, x2, y2] = extent;
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (isFinite(dx) && isFinite(dy)) {
      if (dx > dy) {
        y2 = y1 + dx;
      } else {
        x2 = x1 + dy;
      }
    }
    this._extent = [x1, y1, x2, y2];
    this.initRoot();
  }

  setExtent(extent: BBox) {
    this.extent = extent;
    return this;
  }

  setMaxNodeSizeLog2(value: number) {
    this.maxNodeSizeLog2 = value;
    return this;
  }

  setMinNodeSizeLog2(value: number) {
    this.minNodeSizeLog2 = value;
    return this;
  }

  setNodeCapacity(value: number) {
    this.nodeCapacity = value;
    return this;
  }

  setLowerThreshold(value: number) {
    this.lowerThreshold = value;
    return this;
  }

  visit(callback: VisitCallback) {
    this.root?.visit(callback);
  }

  visitNonEmpty(callback: VisitCallback) {
    this.root?.visitNonEmpty(callback);
  }

  get minSizeLog2() {
    return this.minNodeSizeLog2 - Math.log2(this.scale);
  }

  get maxSizeLog2() {
    return this.maxNodeSizeLog2 - Math.log2(this.scale);
  }

  addFeature(feature: SpeciesFeature) {
    this.root?.add(
      feature,
      this.maxSizeLog2,
      this.minSizeLog2,
      this.nodeCapacity,
    );
  }

  addFeatures(features: SpeciesFeature[]) {
    features.forEach((feature) => this.addFeature(feature));
    return this;
  }

  private clear() {
    this.initRoot();
  }

  /**
   * Get all non-empty grid cells
   */
  cellsNonEmpty(): Node[] {
    const nodes: Node[] = [];
    this.visitNonEmpty((node) => {
      nodes.push(node);
    });
    return nodes;
  }

  /**
   * Get all bins less than maxNodeSizeLog2
   * @param patchSparseNodes {Boolean} Keep parent cell behind sub-cells if
   * some but not all four sub-cells get the minimum number of records to be
   * included. Default false.
   * @return an Array of quadtree nodes
   */
  cells(patchSparseNodes = false): Node[] {
    if (patchSparseNodes) {
      this.root?.patchSparseNodes(this.maxSizeLog2, this.lowerThreshold);
    }

    const nodes: Node[] = [];
    this.visitNonEmpty((node: Node) => {
      // Skip biggest non-empty nodes if its number of features are below the lower threshold
      if (node.numFeatures < this.lowerThreshold) {
        return true;
      }
      nodes.push(node);
    });

    return nodes;
  }

  static renderer(projection: GeoProjection) {
    return (d: Node) =>
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
}
