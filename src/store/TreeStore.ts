import {
  makeObservable,
  observable,
  action,
  computed,
  autorun,
  type IReactionDisposer,
} from 'mobx';
import type RootStore from './RootStore';
import { prepareTree, parseTree, getAccumulatedTreeData } from '../utils/tree';
import { loadText } from '../utils/loader';
import { visitTreeDepthFirstPreOrder } from '../utils/tree';
import type { PhyloNode } from '../utils/tree';
import {
  reconstructAncestralRanges,
  type AncestralMap,
  type AncestralData,
  type ClustersPerSpecies,
} from '../utils/tree/parsimony';
import {
  layoutTree,
  nodeXY,
  makeLinkDraw,
  labelTransform,
  labelOffset,
  type LayoutNode,
  type LayoutLink,
  type LayoutMode,
  type CurveMode,
  type SizeMode,
} from '../utils/tree/treeLayout';
import { format } from 'd3-format';
import { scaleLinear } from 'd3-scale';
// d3 umbrella has the shape/scale helpers (d3-shape, d3-scale are transitive via `d3`).
import { scaleSqrt } from 'd3';
import { isEqual } from '../utils/math';
import {
  plot,
  type Plot,
  type BackendType,
  type HoverHit,
} from '@mapequation/d3gl/map';
import { LabelLayer, type LabelAnchor } from '@mapequation/d3gl/labels';
import type { ViewTransform } from '@mapequation/d3gl/geo';
import { ASPECT_RATIO, MAX_WIDTH } from '../responsive';

export type TreeNode = {
  data: PhyloNode;
  bioregionId?: number;
};

// Tree viewport (the d3gl plot is laid out in these world coordinates). Responsive: the plot
// fills the available width up to MAX_WIDTH at ASPECT_RATIO; the layout is recomputed for the
// live box on resize (the render autorun tracks width/height).
const TREE_WIDTH = MAX_WIDTH;
const TREE_HEIGHT = MAX_WIDTH / ASPECT_RATIO;
const LINE_MIN = 0.6;
const LINE_MAX = 9; // branch-width range when scaling by subtended terminals
const PIE_MIN = 3;
const PIE_MAX = 11;
const LABEL_GAP = 6;
const LABEL_H = 14;
const NEUTRAL_STROKE = '#999999';

interface Wedge {
  cx: number;
  cy: number;
  r: number;
  a0: number;
  a1: number;
  clusterId: number;
  single: boolean;
  node: LayoutNode;
}

/** One reconstructed-range slice for the hover tooltip: a bioregion, its share of the
 *  clade's occurrences, and the bioregion color. */
export interface HoverRegion {
  clusterId: number;
  count: number;
  fraction: number;
  color: string;
}

/** Ancestral-range summary of the hovered tree node/branch, shown in the tree tooltip
 *  while the matching bioregions are emphasized on the map. */
export interface TreeHoverInfo {
  name: string;
  speciesCount: number;
  regions: HoverRegion[];
}

export default class TreeStore {
  rootStore: RootStore;
  isLoading: boolean = false;
  isLoaded: boolean = false;
  tree: PhyloNode | null = null;
  treeString: string | null = null;
  numLeafNodes: number = 0;
  weightParameter: number = 0.5; // Domain [0,1] for tree weight
  treeNodeMap = new Map<string, TreeNode>(); // name -> { data: PhyloNode, bioregionId: number }

  // World-coordinate viewport, mirrored from the responsive host. Observable so the render
  // autorun re-lays-out the tree (and re-culls labels) when the container resizes.
  width = TREE_WIDTH;
  height = TREE_HEIGHT;
  // Canvas2D default for an instant first frame; WebGL is smoother for very large trees.
  backend: BackendType = 'auto';
  // Display options (mirroring the d3gl ancestral-ranges example).
  layout: LayoutMode = 'rectangular';
  curve: CurveMode = 'step';
  coords: SizeMode = 'screen';

  // d3gl plot engine + HTML label overlay, driven imperatively from a MobX autorun.
  private engine: Plot | null = null;
  private labelEl: HTMLDivElement | null = null;
  private labels: LabelLayer | null = null;
  private anchors: LabelAnchor[] = [];
  view: ViewTransform = { k: 1, x: 0, y: 0 };
  private renderDisposer: IReactionDisposer | null = null;
  private sizeObserver: ResizeObserver | null = null;

  // Latest ancestral-range reconstruction (node → ranges/distribution), looked up on hover.
  // Kept off the observable graph: it's rebuilt by `renderTree` and read by `onHover`.
  private ancestral: AncestralMap | null = null;
  // The tree layer currently showing a manual hover outline, so it can be cleared on hover-out.
  private hoverLayer: string | null = null;

  // Hover state for the React tooltip (set from the d3gl `hover` event).
  hoverInfo: TreeHoverInfo | null = null;
  hoverPos: [number, number] = [0, 0];

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    makeObservable(this, {
      isLoading: observable,
      isLoaded: observable,
      tree: observable.ref,
      treeNodeMap: observable.ref,
      treeString: observable,
      weightParameter: observable,
      numLeafNodes: observable,
      width: observable,
      height: observable,
      setSize: action,
      view: observable.ref,
      setView: action,
      resetView: action,
      isViewDefault: computed,
      backend: observable,
      setBackend: action,
      layout: observable,
      curve: observable,
      coords: observable,
      hoverInfo: observable.ref,
      hoverPos: observable.ref,
      setHoverInfo: action,
      setLayout: action,
      setCurve: action,
      setCoords: action,
      haveTree: computed,
      numNodes: computed,
      lineagesThroughTime: computed,
      nodeStyles: computed,
      timeFormatter: computed,
    });
  }

  setBackend = action((backend: BackendType) => {
    if (backend === this.backend) return;
    this.backend = backend;
    // Swap the backend in place; the Scene and zoom are preserved.
    this.engine?.setBackend(backend);
    this.engine?.render();
    this.updateLabels();
  });

  // Display-option setters. The render autorun tracks these reads, so it re-runs on change.
  setLayout = action((layout: LayoutMode) => {
    this.layout = layout;
  });
  setCurve = action((curve: CurveMode) => {
    this.curve = curve;
  });
  setCoords = action((coords: SizeMode) => {
    this.coords = coords;
  });

  clearData = action(() => {
    this.isLoaded = false;
    this.tree = null;
    this.treeString = null;
  });

  get haveTree() {
    return this.tree != null;
  }

  get numNodes() {
    return this.treeNodeMap.size;
  }

  get lineagesThroughTime() {
    if (this.tree === null) {
      return [];
    }
    return getAccumulatedTreeData(this.tree, {
      getNodeData: (node) =>
        !node.isLeaf ? 1 : isEqual(node.time, 1, 1e-3) ? 0 : -1,
      initialValue: 1,
    });
  }

  get nodeStyles() {
    if (this.tree === null || this.rootStore.infomapStore.numBioregions === 0) {
      return {};
    }
    const { colorBioregion } = this.rootStore.colorStore;
    const styles: { [key: string]: { fillColour: string; shape?: string } } = {};
    this.treeNodeMap.forEach((value, name) => {
      if (name && value.bioregionId) {
        styles[name] = {
          fillColour: colorBioregion(value.bioregionId),
        };
      }
    });
    return styles;
  }

  /**
   * Return a function that takes a value from the `time` variable and outputs an
   * SI-formatted time before youngest leaf based on the branch lengths in the tree.
   */
  get timeFormatter() {
    if (!this.tree) {
      return (t: number) => format('.1s')(1 - t);
    }
    const scale = scaleLinear().range([this.tree.maxLeafDistance, 0]);
    const f = format('.2s');
    return (time: number) => (time === 1 ? '0' : f(scale(time)));
  }

  setTree = action((tree: PhyloNode | null) => {
    this.tree = tree;
    this.calculateTreeStats();
    this.rootStore.infomapStore.updateNetwork();
  });

  setTreeString = action((treeString: string) => {
    this.treeString = treeString;
  });

  setIsLoading = action((isLoading: boolean = true) => {
    this.isLoading = isLoading;
  });

  setIsLoaded = action((isLoaded: boolean = true) => {
    this.isLoading = false;
    this.isLoaded = isLoaded;
  });

  loadString(tree: string) {
    this.setIsLoading();
    this.setTreeString(tree);
    this.setTree(prepareTree(parseTree(tree)));
    this.setIsLoaded();
  }

  async load(file: File | string) {
    this.setIsLoading();
    const tree = await loadText(file);
    this.setTreeString(tree);
    this.setTree(prepareTree(parseTree(tree)));
    this.setIsLoaded();
  }

  clearBioregions() {
    this.treeNodeMap.forEach((node) => {
      node.bioregionId = undefined;
    });
  }

  calculateTreeStats = action(() => {
    if (!this.tree) {
      return;
    }
    const treeNodeMap = new Map<string, TreeNode>();
    let numLeafNodes: number = 0;
    visitTreeDepthFirstPreOrder(this.tree, (node) => {
      treeNodeMap.set(node.name, {
        data: node,
        bioregionId: undefined,
      });
      if (node.isLeaf) {
        ++numLeafNodes;
      }
    });
    this.treeNodeMap = treeNodeMap;
    this.numLeafNodes = numLeafNodes;
  });

  // --- d3gl rendering ---

  /**
   * For each leaf, the set of bioregions its occurrences fall in (with counts), built from
   * `species.countPerRegion` (maintained by InfomapStore once bioregions are computed). This is
   * the per-species input to the Fitch ancestral-range reconstruction.
   */
  private getClustersPerSpecies(): ClustersPerSpecies {
    const { speciesMap } = this.rootStore.speciesStore;
    const result: ClustersPerSpecies = {};
    this.treeNodeMap.forEach((node, name) => {
      if (!node.data.isLeaf) return;
      const species = speciesMap.get(name);
      if (!species || species.countPerRegion.size === 0) return;
      const clusters = Array.from(species.countPerRegion, ([clusterId, count]) => ({
        clusterId,
        count,
      }));
      result[name] = {
        totCount: clusters.reduce((s, r) => s + r.count, 0),
        clusters,
      };
    });
    return result;
  }

  setSize = action((width: number, height: number) => {
    this.width = width;
    this.height = height;
  });

  // Mirror the responsive host's CSS width into width/height (height = width / aspect). Unlike
  // GeoMap, a Plot keeps fixed world coords on resize (no auto-refit), so the render autorun
  // re-lays-out the tree to the new box when these observables change. d3gl runs its own
  // ResizeObserver on the same host to resize the canvas surface.
  private observeSize(host: HTMLElement) {
    const measure = () => {
      const w = Math.round(host.getBoundingClientRect().width);
      if (w > 0) this.setSize(w, Math.round(w / ASPECT_RATIO));
    };
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      this.sizeObserver = new ResizeObserver(measure);
      this.sizeObserver.observe(host);
    }
  }

  setView = action((t: ViewTransform) => {
    this.view = t;
  });

  /** True when the view is at its default (no pan/zoom) — drives the reset button's disabled state. */
  get isViewDefault() {
    const { k, x, y } = this.view;
    return k === 1 && x === 0 && y === 0;
  }

  /** Wire d3-zoom; also re-seeds its internal transform from the current `view`, so calling this
   *  after a programmatic setTransform keeps the gesture state in sync. */
  private enableTreeZoom() {
    this.engine?.enableZoom([0.5, 40], (t) => {
      this.setView(t);
      this.updateLabels();
    });
  }

  /** Reset zoom/pan to identity and re-align d3-zoom + the label overlay. */
  resetView = action(() => {
    this.setView({ k: 1, x: 0, y: 0 });
    this.engine?.setTransform(this.view);
    this.enableTreeZoom();
    this.updateLabels();
  });

  setHost(host: HTMLElement) {
    this.disposeEngine();

    const engine = plot(host, {
      aspectRatio: ASPECT_RATIO,
      backend: this.backend,
    });
    this.engine = engine;

    // HTML label overlay above the canvas (pointer-events none so zoom passes through).
    const labelEl = document.createElement('div');
    labelEl.style.position = 'absolute';
    labelEl.style.inset = '0';
    labelEl.style.pointerEvents = 'none';
    labelEl.style.overflow = 'hidden';
    labelEl.style.fontSize = '11px';
    labelEl.style.lineHeight = '14px';
    host.appendChild(labelEl);
    this.labelEl = labelEl;
    this.labels = new LabelLayer(labelEl, (a) => a.text);

    this.enableTreeZoom();

    // Native d3gl picking (clip-aware): hovering a branch or node pie reads out that clade's
    // reconstructed ancestral range — shown in the tree tooltip and cross-highlighted on the map.
    engine.on('hover', this.onHover);

    // Set the initial size from the laid-out host before the first render, then track resizes.
    this.observeSize(host);

    // Rebuild whenever the tree, bioregions, colors, or size change (autorun tracks the reads).
    this.renderDisposer = autorun(() => this.renderTree());
  }

  disposeEngine = () => {
    this.clearHover();
    this.sizeObserver?.disconnect();
    this.sizeObserver = null;
    this.renderDisposer?.();
    this.renderDisposer = null;
    this.labels?.destroy();
    this.labels = null;
    if (this.labelEl?.parentNode) {
      this.labelEl.parentNode.removeChild(this.labelEl);
    }
    this.labelEl = null;
    this.engine?.destroy();
    this.engine = null;
  };

  private updateLabels() {
    this.labels?.update(this.anchors, this.view, {
      width: this.width,
      height: this.height,
    });
  }

  /** Dominant region of a node's displayed range (highest-count slice within the set). */
  private regionColor = (bioregionId: number): string =>
    this.rootStore.colorStore.colorBioregion(bioregionId) ?? NEUTRAL_STROKE;

  /** Slices for a node's pie: regions in the reconstructed range, sized by occurrence count. */
  private pieSlices(data: AncestralData) {
    const counts = new Map(data.clusters.clusters.map((r) => [r.clusterId, r.count]));
    const regs = data.ranges.clusters
      .map((r) => ({ clusterId: r.clusterId, count: counts.get(r.clusterId) ?? 0 }))
      .sort((a, b) => b.count - a.count || a.clusterId - b.clusterId);
    if (regs.length === 0) return [];
    const tot = regs.reduce((s, r) => s + r.count, 0);
    let a = -Math.PI / 2;
    return regs.map((r) => {
      const frac = tot > 0 ? r.count / tot : 1 / regs.length;
      const a0 = a;
      const a1 = a + frac * 2 * Math.PI;
      a = a1;
      return { clusterId: r.clusterId, count: r.count, a0, a1 };
    });
  }

  private renderTree() {
    const engine = this.engine;
    if (engine === null) return;

    const tree = this.tree;
    if (tree === null) {
      this.clearHover();
      this.ancestral = null;
      engine.layer('links', [], { draw: () => {} });
      engine.layer('pies', [], { draw: () => {} });
      this.anchors = [];
      this.updateLabels();
      engine.render();
      return;
    }

    const { haveBioregions } = this.rootStore.infomapStore;
    const { layout: mode, curve, coords: sizeMode } = this;

    const { root, center } = layoutTree(tree, mode, this.width, this.height);
    const links = root.links();
    const leaves = root.leaves();
    const xy = (n: LayoutNode): [number, number] => nodeXY(n, mode, center);
    const drawLink = makeLinkDraw(mode, curve, center);

    // Reconstruct ancestral ranges only once bioregions exist; otherwise draw a plain tree.
    let ancestral: AncestralMap | null = null;
    let widthScale: ((n: number) => number) | null = null;
    let screenRadius: ((n: number) => number) | null = null;
    if (haveBioregions) {
      ancestral = reconstructAncestralRanges(tree, this.getClustersPerSpecies());
      this.ancestral = ancestral;
      const total = ancestral.get(tree)?.speciesCount ?? 1;
      const ws = scaleSqrt().domain([1, total]).range([LINE_MIN, LINE_MAX]);
      const rs = scaleSqrt().domain([1, total]).range([PIE_MIN, PIE_MAX]);
      widthScale = (n) => ws(n);
      screenRadius = (n) => rs(n);
    }

    const dataOf = (n: LayoutNode): AncestralData | undefined => ancestral?.get(n.data);
    const topRegion = (n: LayoutNode): number | undefined => {
      const d = dataOf(n);
      return d ? this.pieSlices(d)[0]?.clusterId : undefined;
    };
    const branchWidth = (n: LayoutNode): number => {
      const d = dataOf(n);
      return widthScale && d ? widthScale(d.speciesCount) : 0.8;
    };
    // World coords: pie diameter = the incoming branch width (scales with zoom). Screen coords:
    // a fixed pixel size so small-clade nodes stay visible.
    const pieRadius = (n: LayoutNode): number => {
      const d = dataOf(n);
      if (sizeMode === 'screen') return d && screenRadius ? screenRadius(d.speciesCount) : PIE_MIN;
      return branchWidth(n) / 2;
    };

    // Links (branches): colored by the child clade's dominant region, width by terminals.
    engine.layer('links', links, {
      draw: (ctx, l) => drawLink(ctx, l),
      stroke: (l: LayoutLink) => {
        const t = topRegion(l.target);
        return t == null ? NEUTRAL_STROKE : this.regionColor(t);
      },
      lineWidth: (l: LayoutLink) => branchWidth(l.target),
      sizeMode,
    });

    // Pies (ancestral-range distribution at each node) — only with bioregions.
    if (ancestral) {
      const wedges: Wedge[] = [];
      for (const n of root.descendants()) {
        const d = dataOf(n);
        if (!d) continue;
        const slices = this.pieSlices(d);
        if (slices.length === 0) continue;
        const [cx, cy] = xy(n);
        const r = pieRadius(n);
        const single = slices.length === 1;
        for (const s of slices) {
          wedges.push({
            cx,
            cy,
            r,
            a0: s.a0,
            a1: s.a1,
            clusterId: s.clusterId,
            single,
            node: n,
          });
        }
      }
      engine.layer('pies', wedges, {
        draw: (ctx, w) => {
          if (w.single) {
            ctx.moveTo(w.cx + w.r, w.cy);
            ctx.arc(w.cx, w.cy, w.r, 0, 2 * Math.PI);
            ctx.closePath();
          } else {
            ctx.moveTo(w.cx, w.cy);
            ctx.arc(w.cx, w.cy, w.r, w.a0, w.a1);
            ctx.closePath();
          }
        },
        fill: (w: Wedge) => this.regionColor(w.clusterId),
        stroke: '#ffffff',
        lineWidth: (w: Wedge) => (w.single ? 0 : Math.min(0.5, w.r * 0.16)),
        anchor: (w: Wedge) => [w.cx, w.cy],
        sizeMode,
        // Screen mode: declutter overlapping fixed-size pies on zoom (bigger clades win).
        declutter: sizeMode === 'screen' ? 2 * PIE_MAX + 2 : undefined,
        id: (_w, i) => i,
      });
    } else {
      // No bioregions yet: no ancestral ranges to hover, so drop any stale reconstruction/hover.
      this.ancestral = null;
      this.clearHover();
      engine.layer('pies', [], { draw: () => {} });
    }

    // Leaf labels (outward of each tip).
    this.anchors = leaves.map((n, i) => {
      const [px, py] = xy(n);
      const name = n.data.name;
      const a = n.x - Math.PI / 2; // screen-direction angle for radial placement
      return {
        id: `t${i}`,
        refX: px,
        refY: py,
        text: name,
        width: name.length * 6.2 + 6,
        height: LABEL_H,
        priority: dataOf(n)?.speciesCount ?? 1,
        offset: labelOffset(mode, a, LABEL_GAP, LABEL_H),
        transform: labelTransform(mode, a),
        transformOrigin: '0 0',
      } as LabelAnchor;
    });

    engine.render();
    this.updateLabels();
  }

  // --- Hover: show a node's ancestral range (tree tooltip + map cross-highlight) ---

  /** Resolve the tree node behind a hover hit: a branch (`links` → its child node) or a node pie. */
  private nodeFromHit(hit: HoverHit | null): LayoutNode | undefined {
    if (!hit) return undefined;
    if (hit.layer === 'pies') return (hit.datum as Wedge | null)?.node;
    if (hit.layer === 'links') return (hit.datum as LayoutLink | null)?.target;
    return undefined;
  }

  private onHover = (hit: HoverHit | null, ev: PointerEvent) => {
    const node = this.nodeFromHit(hit);
    const data = node ? this.ancestral?.get(node.data) : undefined;
    if (!hit || !node || !data) {
      this.clearHover();
      return;
    }
    const slices = this.pieSlices(data);
    if (slices.length === 0) {
      this.clearHover();
      return;
    }

    // Outline the hovered branch/pie in the tree's overlay layer (clearing a previous one on
    // another layer first); the base geometry is untouched, so this is one feature per change.
    // Branches: black overdraw at the branch's own width. Pies: a 1.5px black outline (their
    // base lineWidth is 0 for single-region nodes, so the default white outline would vanish).
    if (this.hoverLayer && this.hoverLayer !== hit.layer) {
      this.engine?.highlight(this.hoverLayer, null);
    }
    this.hoverLayer = hit.layer;
    this.engine?.highlight(
      hit.layer,
      hit.id,
      hit.layer === 'pies'
        ? { stroke: '#000000', lineWidth: 1.5 }
        : { stroke: '#000000' },
    );

    // Light up the same bioregions on the map (dims the rest via the cells' `selection`).
    this.rootStore.mapStore.highlightBioregions(
      new Set(slices.map((s) => s.clusterId)),
    );

    const regions: HoverRegion[] = slices.map((s) => ({
      clusterId: s.clusterId,
      count: s.count,
      // The slice already encodes the count-weighted share as its arc (with an equal-slice
      // fallback when every region has zero count), so derive the fraction from the angle.
      fraction: (s.a1 - s.a0) / (2 * Math.PI),
      color: this.regionColor(s.clusterId),
    }));
    this.setHoverInfo(
      { name: node.data.name, speciesCount: data.speciesCount, regions },
      [ev.offsetX, ev.offsetY],
    );
  };

  /** Clear the hover overlay, the map cross-highlight, and the tooltip. */
  clearHover = () => {
    if (this.hoverLayer) {
      this.engine?.highlight(this.hoverLayer, null);
      this.hoverLayer = null;
    }
    this.rootStore.mapStore.highlightBioregions(null);
    if (this.hoverInfo !== null) this.setHoverInfo(null, this.hoverPos);
  };

  setHoverInfo = action((info: TreeHoverInfo | null, pos: [number, number]) => {
    this.hoverInfo = info;
    this.hoverPos = pos;
  });

  /** File extension for the current export format (SVG when the SVG backend is selected). */
  get imageExtension(): '.svg' | '.png' {
    return this.backend === 'svg' ? '.svg' : '.png';
  }

  /** Export the current tree as an SVG (svg backend) or PNG (canvas/webgl) blob. */
  async getImageBlob(): Promise<Blob> {
    if (this.engine === null) {
      throw new Error('No tree engine to export');
    }
    if (this.backend === 'svg') {
      const svg = this.engine.toSVG();
      if (!svg) throw new Error("Can't export tree image");
      return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    }
    const dataUrl = this.engine.toPNG();
    if (!dataUrl) {
      throw new Error("Can't export tree image");
    }
    return (await fetch(dataUrl)).blob();
  }
}
