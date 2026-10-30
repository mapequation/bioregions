import { action, makeObservable, observable, computed } from 'mobx';
import type { BBox, GeoJsonProperties } from '../../types/geojson';
import type { GeoFeature } from '../../store/SpeciesStore';
import type SpeciesStore from '../../store/SpeciesStore';
import { rangeArray, rangeArrayOneSignificant } from '../range';
import Cell from './Cell';

export type VisitCallback = (node: Cell) => true | undefined;

export type QuadtreeNodeProperties = GeoJsonProperties & {
  numRecords: number;
  features: GeoFeature[];
};

/**
 * Quadtree GeoJSON binner
 * @TODO: Support polygon types (assume point types now)
 */
export default class QuadtreeGeoBinner {
  private _extent: BBox = [-256, -256, 256, 256]; // power of 2 to get 1x1 degree grid cells
  cellSizeLog2Range = rangeArray(-7, 6, 1, { inclusive: true });
  maxCellSizeLog2: number = 2;
  minCellSizeLog2: number = 0;
  cellCapacityRange = rangeArrayOneSignificant(0, 6, { inclusive: true });
  maxCellCapacity: number = 100;
  minCellCapacity: number = 10;
  root: Cell | null = null;
  private _scale: number = 1; // Set to 60 to have sizes subdivided to eventually one minute
  _cells: Cell[] = [];
  private _speciesStore: SpeciesStore;
  patchSparseCells = true;
  // Records in no emitted cell, from the last generateCells.
  numDroppedSparse: number = 0;

  cellsNeedUpdate: boolean = true; // Revisit tree to regenerate cells if dirty
  treeNeedUpdate: boolean = false; // Revisit data to regenerate tree if dirty

  constructor(speciesStore: SpeciesStore) {
    this._speciesStore = speciesStore;

    makeObservable(this, {
      maxCellSizeLog2: observable,
      minCellSizeLog2: observable,
      maxCellCapacity: observable,
      minCellCapacity: observable,
      cellSizeLog2: computed,
      cellCapacity: computed,
      patchSparseCells: observable,
      cellsNeedUpdate: observable,
      treeNeedUpdate: observable,
      _cells: observable.ref,
      cells: computed,
    });

    this._initExtent();
    this._initRoot();
  }

  private _initExtent() {
    // power of 2 from unscaled unit
    let size = 2 ** this.maxCellSizeLog2 / this.scale;
    while (size <= 180) {
      size *= 2;
    }
    this.extent = [-size, -size, size, size];
  }

  private _initRoot() {
    this.root = new Cell(this.extent, this.maxCellSizeLog2);
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
    if (Number.isFinite(dx) && Number.isFinite(dy)) {
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

  setPatchSparseCells = action((value: boolean = true) => {
    if (value !== this.patchSparseCells) {
      this.patchSparseCells = value;
      // generateCells redoes the remainder pass from the leaf records.
      this.setCellsNeedUpdate();
    }
  });

  setCellsNeedUpdate = action((value: boolean = true) => {
    this.cellsNeedUpdate = value;
  });

  setTreeNeedUpdate = action((value: boolean = true) => {
    this.treeNeedUpdate = value;
    if (value) {
      this.cellsNeedUpdate = true;
    }
  });

  addFeature(feature: GeoFeature) {
    this.root?.add(
      feature,
      this.maxSizeLog2,
      this.minSizeLog2,
      this.maxCellCapacity,
    );
    this.setCellsNeedUpdate();
  }

  addFeatures(features: GeoFeature[]) {
    features.forEach((feature) => {
      this.addFeature(feature);
    });
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
      this.generateCells(this.patchSparseCells);
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
    this.addFeatures(this._speciesStore.collection.features);
    this.setTreeNeedUpdate(false);
    console.timeEnd('generateTree');
  }

  /**
   * Generate the grid cells, in pre-order (parents before children).
   *
   * Cells partition the records. A leaf with at least minCellCapacity records
   * is a cell. With `patchSparseNodes`, the records of a node that falls short
   * pass up to its parent, and an internal node that collects at least
   * minCellCapacity of them is a remainder cell covering its own area minus
   * its emitted descendants (see Cell.partition). Records still short at
   * maxCellSizeLog2, or in sparse leaves without patching, are dropped and
   * counted in numDroppedSparse.
   * @param patchSparseNodes {Boolean} Collect the records of sparse cells in
   * remainder cells. Default true.
   * @return Array of quadtree nodes
   */
  generateCells = action((patchSparseNodes = true): Cell[] => {
    console.time('generateCells');
    const dropped = { count: 0 };
    this.root?.partition(
      this.maxSizeLog2,
      Math.max(this.minCellCapacity, 1),
      patchSparseNodes,
      dropped,
    );
    this.numDroppedSparse = dropped.count;

    const nodes: Cell[] = [];
    this.visit((node: Cell) => {
      if (node.isCell) {
        nodes.push(node);
      }
      return undefined;
    });

    this._cells = nodes;
    this.setCellsNeedUpdate(false);
    console.timeEnd('generateCells');
    return nodes;
  });

  find(x: number, y: number, radius?: number) {
    if (radius === undefined) {
      radius = Infinity;
    }
    return this.root?.find(x, y, radius);
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
  //       // @ts-expect-error projection accepts a [lon, lat] tuple, not the inferred number[]
  //       .map((point) => projection(point))
  //       .join('L') +
  //     'Z';
  // }
}
