import { action, makeObservable, observable, computed } from 'mobx';
//import { GeoProjection } from 'd3';
import { BBox, GeoJsonProperties, Polygon } from '../types/geojson';
import { area } from './geomath';
import type { PointFeature } from '../store/SpeciesStore';
import type SpeciesStore from '../store/SpeciesStore';
import { rangeArray, rangeArrayOneSignificant } from './range';
import type { ExtendedFeature } from 'd3';

type VisitCallback = (node: Node) => true | void;

export type QuadtreeNodeProperties = GeoJsonProperties & {
  numRecords: number;
  features: PointFeature[];
};

export class Node implements ExtendedFeature<Polygon, QuadtreeNodeProperties> {
  x1: number; // west
  y1: number; // south
  x2: number; // east
  y2: number; // north
  visible: boolean;
  isLeaf: boolean = true;
  features: PointFeature[] = [];
  parent: Node | null = null;
  private children: [
    Node | undefined,
    Node | undefined,
    Node | undefined,
    Node | undefined,
  ] = [undefined, undefined, undefined, undefined];
  bioregionId: number = 0;
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
      coordinates: [
        [
          [this.x1, this.y1],
          [this.x1, this.y2],
          [this.x2, this.y2],
          [this.x2, this.y1],
          [this.x1, this.y1],
        ],
      ],
    };
  }

  get geometries(): Polygon[] {
    return [this.geometry];
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
    feature: PointFeature,
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
        (this.children[i] = new Node([x1, y1, x2, y2], maxCellSizeLog2));

      child.parent = this;
      child.id = `${this.id}${i}`;

      child.add(feature, maxCellSizeLog2, minCellSizeLog2, nodeCapacity);
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

  patchPartiallyEmptyNodes(maxCellSizeLog2: number) {
    if (this.isLeaf) return this.features;

    // Already patched if features at non-leaf node.
    if (this.features.length > 0) {
      return this.features;
    }

    const nonEmptyChildren: Node[] = this.children.filter(
      (child) => child !== undefined,
    ) as Node[];

    const doPatch =
      this.sizeLog2 <= maxCellSizeLog2 &&
      this.features.length === 0 &&
      nonEmptyChildren.length < 4;

    const aggregatedFeatures: PointFeature[] = [];
    nonEmptyChildren.forEach((child: Node) =>
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

    const aggregatedFeatures: PointFeature[] = [];
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

/**
 * Quadtree GeoJSON binner
 * @TODO: Support polygon types (assume point types now)
 */
export class QuadtreeGeoBinner {
  private _extent: BBox = [-256, -256, 256, 256]; // power of 2 to get 1x1 degree grid cells
  cellSizeLog2Range = rangeArray(-3, 6, 1, { inclusive: true });
  maxCellSizeLog2: number = 2;
  minCellSizeLog2: number = 0;
  cellCapacityRange = rangeArrayOneSignificant(0, 6, { inclusive: true });
  maxCellCapacity: number = 100;
  minCellCapacity: number = 10;
  root: Node | null = null;
  private _scale: number = 1; // Set to 60 to have sizes subdivided to eventually one minute
  _cells: Node[] = [];
  private _speciesStore: SpeciesStore;

  cellsNeedUpdate: boolean = true; // Revisit tree to regenerate cells if dirty
  treeNeedUpdate: boolean = true; // Revisit data to regenerate tree if dirty

  constructor(speciesStore: SpeciesStore) {
    this._speciesStore = speciesStore;

    makeObservable(this, {
      maxCellSizeLog2: observable,
      minCellSizeLog2: observable,
      maxCellCapacity: observable,
      minCellCapacity: observable,
      cellSizeLog2: computed,
      cellCapacity: computed,
      cellsNeedUpdate: observable,
      treeNeedUpdate: observable,
      setCellsNeedUpdate: action,
      generateCells: action,
      _cells: observable.ref,
      cells: computed,
    });

    this._initExtent();
    this._initRoot();
  }

  private _initExtent() {
    // power of 2 from unscaled unit
    let size = Math.pow(2, this.maxCellSizeLog2) / this.scale;
    while (size <= 180) {
      size *= 2;
    }
    this.extent = [-size, -size, size, size];
  }

  private _initRoot() {
    this.root = new Node(this.extent, this.maxCellSizeLog2);
  }

  get scale() {
    return this._scale;
  }

  set scale(scale: number) {
    // Set to 60 to have sizes subdivided to eventually one minute.
    this._scale = scale;
    this._initExtent();
    this._initRoot();
    this.setTreeNeedUpdate();
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
    this._initRoot();
    this.setTreeNeedUpdate();
  }

  setExtent(extent: BBox) {
    this.extent = extent;
    return this;
  }

  get minSizeLog2() {
    return this.minCellSizeLog2 - Math.log2(this.scale);
  }

  get maxSizeLog2() {
    return this.maxCellSizeLog2 - Math.log2(this.scale);
  }

  setMinCellSizeLog2 = action((minCellSizeLog2: number) => {
    if (minCellSizeLog2 !== this.minCellSizeLog2) {
      this.minCellSizeLog2 = minCellSizeLog2;
      this.setTreeNeedUpdate();
    }
    return this;
  });

  setMaxCellSizeLog2 = action((maxCellSizeLog2: number) => {
    if (maxCellSizeLog2 !== this.maxCellSizeLog2) {
      this.maxCellSizeLog2 = maxCellSizeLog2;
      this.setTreeNeedUpdate();
    }
    return this;
  });

  setCellSizeLog2 = action(
    (minCellSizeLog2: number, maxCellSizeLog2: number) => {
      this.setMinCellSizeLog2(minCellSizeLog2);
      this.setMaxCellSizeLog2(maxCellSizeLog2);
      return this;
    },
  );

  get cellSizeLog2(): [number, number] {
    return [this.minCellSizeLog2, this.maxCellSizeLog2];
  }

  setMinCellCapacity = action((minCellCapacity: number) => {
    if (minCellCapacity !== this.minCellCapacity) {
      this.minCellCapacity = minCellCapacity;
      this.setTreeNeedUpdate();
    }
    return this;
  });

  setMaxCellCapacity = action((maxCellCapacity: number) => {
    if (maxCellCapacity !== this.maxCellCapacity) {
      this.maxCellCapacity = maxCellCapacity;
      this.setTreeNeedUpdate();
    }
    return this;
  });

  setCellCapacity = action(
    (minCellCapacity: number, maxCellCapacity: number) => {
      this.setMinCellCapacity(minCellCapacity);
      this.setMaxCellCapacity(maxCellCapacity);
      return this;
    },
  );

  get cellCapacity(): [number, number] {
    return [this.minCellCapacity, this.maxCellCapacity];
  }

  setCellsNeedUpdate(value: boolean = true) {
    this.cellsNeedUpdate = value;
  }

  setTreeNeedUpdate(value: boolean = true) {
    this.treeNeedUpdate = value;
    if (value) {
      this.cellsNeedUpdate = true;
    }
  }

  addFeature(feature: PointFeature) {
    this.root?.add(
      feature,
      this.maxSizeLog2,
      this.minSizeLog2,
      this.maxCellCapacity,
    );
    this.setCellsNeedUpdate();
  }

  addFeatures(features: PointFeature[]) {
    features.forEach((feature) => this.addFeature(feature));
    return this;
  }

  visit(callback: VisitCallback) {
    this.root?.visit(callback);
  }

  visitNonEmpty(callback: VisitCallback) {
    this.root?.visitNonEmpty(callback);
  }

  get cells() {
    if (this.treeNeedUpdate) {
      this.generateTree();
    }
    if (this.cellsNeedUpdate) {
      this.generateCells();
    }
    return this._cells;
  }

  get nameToCellIds() {
    // TODO: Check lazy computed
    const nameToCellIds: { [name: string]: Set<string> } = {};
    const { cells } = this;

    cells.forEach((cell) => {
      cell.speciesTopList.forEach(({ name }) => {
        if (!(name in nameToCellIds)) {
          nameToCellIds[name] = new Set();
        }

        nameToCellIds[name]?.add(cell.id);
      });
    });

    return nameToCellIds;
  }

  // /**
  //  * Get all non-empty grid cells
  //  */
  // cellsNonEmpty(): Node[] {
  //   const nodes: Node[] = [];
  //   this.visitNonEmpty((node) => {
  //     nodes.push(node);
  //   });
  //   return nodes;
  // }

  generateTree() {
    console.time('generateTree');
    this._initExtent();
    this._initRoot();
    this.addFeatures(this._speciesStore.pointCollection.features);
    this.setTreeNeedUpdate(false);
    console.timeEnd('generateTree');
  }

  /**
   * Generate all bins less than maxCellSizeLog2
   * @param patchSparseNodes {Boolean} Keep parent cell behind sub-cells if
   * some but not all four sub-cells get the minimum number of records to be
   * included. Default false.
   * @return Array of quadtree nodes
   */
  generateCells(patchSparseNodes = true): Node[] {
    console.time('generateCells');
    if (patchSparseNodes) {
      this.root?.patchSparseNodes(this.maxSizeLog2, this.minCellCapacity);
    }

    const nodes: Node[] = [];
    this.visitNonEmpty((node: Node) => {
      // Skip biggest non-empty nodes if its number of features are below the lower threshold
      if (node.numFeatures < this.minCellCapacity) {
        return true;
      }
      nodes.push(node);
    });

    this._cells = nodes;
    this.setCellsNeedUpdate(false);
    console.timeEnd('generateCells');
    return nodes;
  }

  // visitWithinThresholds(callback: VisitCallback) {
  //   this.visitNonEmpty((node: Node) => {
  //     // Skip biggest non-empty nodes if its number of features are below the lower threshold
  //     if (node.numFeatures < this.lowerThreshold) {
  //       return true;
  //     }
  //     if (callback(node)) {
  //       return true;
  //     }
  //   });
  // }

  // static getSVGRenderer(projection: GeoProjection) {
  //   return (d: Node) =>
  //     'M' +
  //     [
  //       [d.x1, d.y1],
  //       [d.x2, d.y1],
  //       [d.x2, d.y2],
  //       [d.x1, d.y2],
  //     ]
  //       // @ts-ignore
  //       .map((point) => projection(point))
  //       .join('L') +
  //     'Z';
  // }
}
