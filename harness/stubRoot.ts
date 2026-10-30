/**
 * Minimal stand-in for `RootStore`, for running the network builders outside a browser.
 *
 * `InfomapStore` only ever reaches for `speciesStore.{name,binner}`,
 * `treeStore.{tree,treeNodeMap,timeFormatter}` and `clearBioregions` (verify with
 * `grep -o 'this\.rootStore\.[a-zA-Z.]*' src/store/InfomapStore.ts | sort -u`).
 * Building the real `RootStore` would drag in `MapStore` -> `@mapequation/d3gl`,
 * which needs a DOM and WebGL, so we supply just those members instead.
 *
 * Nothing here re-implements the method under test: network construction still
 * runs the production `InfomapStore` code paths.
 */

import { format } from 'd3-format';
import { scaleLinear } from 'd3-scale';
import InfomapStore from '../src/store/InfomapStore';
import type RootStore from '../src/store/RootStore';
import type SpeciesStore from '../src/store/SpeciesStore';
import type { GeoFeature } from '../src/store/SpeciesStore';
import QuadtreeGeoBinner from '../src/utils/QuadTree';
import type { PhyloNode } from '../src/utils/tree';
import { visitTreeDepthFirstPreOrder } from '../src/utils/tree';

export type TreeNode = { data: PhyloNode; bioregionId: number | undefined };

export interface HeadlessTreeStore {
  tree: PhyloNode | null;
  treeNodeMap: Map<string, TreeNode>;
  /** Names multilayer layers, so it has to match `TreeStore.timeFormatter`. */
  readonly timeFormatter: (time: number) => string;
}

export interface HeadlessRoot {
  speciesStore: {
    name: string;
    binner: QuadtreeGeoBinner;
    speciesMap: Map<string, unknown>;
    /** The binner re-reads this in `generateTree()`, so it must be the single
     * source of truth for occurrences - see `setOccurrences`. */
    collection: { features: GeoFeature[] };
  };
  treeStore: HeadlessTreeStore;
  infomapStore: InfomapStore;
  clearBioregions: () => void;
}

/**
 * Build the `treeNodeMap` exactly as `TreeStore.calculateTreeStats` does, so the
 * name lookups inside the network builders behave identically.
 */
export function buildTreeNodeMap(tree: PhyloNode): Map<string, TreeNode> {
  const treeNodeMap = new Map<string, TreeNode>();
  visitTreeDepthFirstPreOrder(tree, (node) => {
    treeNodeMap.set(node.name, { data: node, bioregionId: undefined });
  });
  return treeNodeMap;
}

/**
 * Copy of `TreeStore.timeFormatter`. `createMultilayerNetwork` names each layer
 * with it, so a divergence here would silently rename layers relative to the app.
 */
function createHeadlessTreeStore(): HeadlessTreeStore {
  return {
    tree: null,
    treeNodeMap: new Map<string, TreeNode>(),
    get timeFormatter() {
      const { tree } = this;
      if (!tree) {
        return (t: number) => format('.1s')(1 - t);
      }
      const scale = scaleLinear().range([tree.maxLeafDistance, 0]);
      const f = format('.2s');
      return (time: number) => (time === 1 ? '0' : f(scale(time)));
    },
  };
}

export function createHeadlessRoot(name = 'dataset'): HeadlessRoot {
  const root = {
    speciesStore: {
      name,
      speciesMap: new Map<string, unknown>(),
      collection: { features: [] as GeoFeature[] },
    },
    treeStore: createHeadlessTreeStore(),
    clearBioregions: () => { },
  } as unknown as HeadlessRoot;

  root.speciesStore.binner = new QuadtreeGeoBinner(
    root.speciesStore as unknown as SpeciesStore,
  );
  root.infomapStore = new InfomapStore(root as unknown as RootStore);

  return root;
}

/**
 * Install occurrences the way `SpeciesStore` does: park them on the collection
 * and let the binner build its own quadtree. Adding straight to the binner is
 * not enough - `generateTree()` re-initialises the root and re-reads
 * `collection.features`, so features held only in the binner get wiped.
 */
export function setOccurrences(root: HeadlessRoot, features: GeoFeature[]) {
  root.speciesStore.collection.features = features;
  root.speciesStore.binner.setTreeNeedUpdate(true);
}
