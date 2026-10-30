/**
 * Headless network builder.
 *
 * Loads occurrences + an optional Newick tree, drives the *production*
 * `InfomapStore` network builders (`createStandardNetwork` /
 * `createStateNetwork` / `createMultilayerNetwork`), and writes the resulting
 * network to JSON for the Python analysis pipeline (`analysis/run_infomap.py`).
 *
 * Clustering deliberately happens on the Python side: `@mapequation/infomap`
 * ships a browser-only WASM wrapper (`URL.createObjectURL` + `new Worker`), and
 * the thing this harness needs to exercise faithfully is *network construction*,
 * not Infomap itself. Serializing the network keeps the seam in the right place
 * and makes 100-seed ensembles cheap.
 *
 * Usage:
 *   npx tsx harness/build-network.ts \
 *     --occurrences public/data/mammals_global.tsv \
 *     --tree public/data/mammals_global.nwk \
 *     --out ../analysis/networks/mammals_t_tw1.json \
 *     --params '{"useWholeTree":true,"treeWeightBalance":1}'
 *
 *   npx tsx harness/build-network.ts --multilayer \
 *     --occurrences public/data/mammals_global.tsv \
 *     --tree public/data/mammals_global.nwk \
 *     --out ../analysis/networks/mammals_multilayer_5.json \
 *     --params '{"numLayers":5,"multilayerLogTime":false,"treeWeightBalance":1}'
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import type InfomapStore from '../src/store/InfomapStore';
import type {
  BioregionsMultilayerNetwork,
  BioregionsNetworkData,
} from '../src/store/InfomapStore';
import type { GeoFeature } from '../src/store/SpeciesStore';
import { createPointFeature } from '../src/store/SpeciesStore';
import { parseOccurrenceTable } from '../src/utils/occurrences';
import { parseTree, prepareTree } from '../src/utils/tree';
import { buildTreeNodeMap, createHeadlessRoot, setOccurrences } from './stubRoot';

/** Settable `InfomapStore` observables. An explicit list so typos fail loudly. */
const INFOMAP_PARAMS = [
  'includeTreeInNetwork',
  'useWholeTree',
  'treeWeightBalance',
  'integrationTime',
  'segregationTime',
  'useWeightedSpeciesLinks',
  'useWeightedTreeNodeLinksIfTimeSlice',
  'spatialNormalizationOrder',
  'uniformTreeLinks',
  'linkWeightThresholdExponent',
  'alwaysUseStateNetwork',
] as const;

/**
 * `InfomapStore` observables that only `createMultilayerNetwork` reads, so they
 * are rejected outside `--multilayer` rather than silently ignored.
 */
const MULTILAYER_PARAMS = ['numLayers', 'multilayerLogTime'] as const;

/** Settable binner options. Defaults match the app (1-4 degrees, capacity 10-100). */
const BINNER_PARAMS = [
  'minCellSizeLog2',
  'maxCellSizeLog2',
  'minCellCapacity',
  'maxCellCapacity',
  'patchSparseCells',
] as const;

type Args = {
  occurrences: string;
  tree?: string;
  out: string;
  params: Record<string, unknown>;
  nameColumn: string;
  lonColumn: string;
  latColumn: string;
  multilayer: boolean;
};

function parseArgs(argv: string[]): Args {
  const get = (flag: string, fallback?: string) => {
    const i = argv.indexOf(`--${flag}`);
    if (i === -1) {
      if (fallback !== undefined) return fallback;
      throw new Error(`Missing required argument --${flag}`);
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Argument --${flag} needs a value`);
    }
    return value;
  };
  const multilayer = argv.includes('--multilayer');
  const rawParams = get('params', '{}');
  let params: Record<string, unknown>;
  try {
    params = JSON.parse(rawParams);
  } catch {
    throw new Error(`--params is not valid JSON: ${rawParams}`);
  }
  const known = new Set<string>([
    ...INFOMAP_PARAMS,
    ...BINNER_PARAMS,
    ...(multilayer ? MULTILAYER_PARAMS : []),
  ]);
  for (const key of Object.keys(params)) {
    if (!known.has(key)) {
      const hint = MULTILAYER_PARAMS.includes(key as (typeof MULTILAYER_PARAMS)[number])
        ? ' (only valid with --multilayer)'
        : '';
      throw new Error(
        `Unknown parameter '${key}'${hint}. Known: ${[...known].sort().join(', ')}`,
      );
    }
  }
  return {
    occurrences: get('occurrences'),
    tree: argv.includes('--tree') ? get('tree') : undefined,
    out: get('out'),
    params,
    nameColumn: get('name-column', 'species'),
    lonColumn: get('lon-column', 'longitude'),
    latColumn: get('lat-column', 'latitude'),
    multilayer,
  };
}

/**
 * Parse a delimited occurrence table into point features the way the app does
 * (`parseOccurrenceTable`), so rows are skipped and names normalized alike.
 */
function readOccurrences(
  path: string,
  nameColumn: string,
  lonColumn: string,
  latColumn: string,
): { features: GeoFeature[]; numSkipped: number } {
  const { occurrences, numSkipped, fields } = parseOccurrenceTable(
    readFileSync(path, 'utf8'),
    { nameColumn, longColumn: lonColumn, latColumn },
  );
  for (const column of [nameColumn, lonColumn, latColumn]) {
    if (!fields.includes(column)) {
      throw new Error(
        `Could not find columns '${nameColumn}', '${lonColumn}', '${latColumn}' in header: ${fields.join(', ')}`,
      );
    }
  }
  const features: GeoFeature[] = occurrences.map(({ name, coordinates }) =>
    createPointFeature(coordinates, { name }),
  );
  return { features, numSkipped };
}

/**
 * The `BioregionsNetworkData` counters every builder maintains. For a multilayer
 * network these are sums over the per-layer networks, so e.g. `numGridCellNodes`
 * is `numLayers * cells.length`, not the number of distinct nodes.
 */
function commonStats(network: BioregionsNetworkData) {
  return {
    numGridCellNodes: network.numGridCellNodes,
    numLeafTaxonNodes: network.numLeafTaxonNodes,
    numInternalTaxonNodes: network.numInternalTaxonNodes,
    numLeafTaxonLinks: network.numLeafTaxonLinks,
    numInternalTaxonLinks: network.numInternalTaxonLinks,
    sumLeafTaxonLinkWeight: network.sumLeafTaxonLinkWeight,
    sumInternalTaxonLinkWeight: network.sumInternalTaxonLinkWeight,
    sumLinkWeight: network.sumLinkWeight,
    sumTreeLinkWeight: network.sumTreeLinkWeight,
    numLinksBelowThreshold: network.numLinksBelowThreshold ?? 0,
    numSpeciesExcluded: network.numSpeciesExcluded ?? 0,
    isDirected: network.isDirected,
    includeTree: network.includeTree,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = createHeadlessRoot(basename(args.occurrences).replace(/\.[^.]+$/, ''));
  const { binner } = root.speciesStore;
  const { infomapStore } = root;

  for (const key of BINNER_PARAMS) {
    if (key in args.params) {
      (binner as unknown as Record<string, unknown>)[key] = args.params[key];
    }
  }

  console.time('load occurrences');
  const { features, numSkipped } = readOccurrences(
    args.occurrences,
    args.nameColumn,
    args.lonColumn,
    args.latColumn,
  );
  setOccurrences(root, features);
  console.timeEnd('load occurrences');
  console.log(
    `Loaded ${features.length} occurrences (${numSkipped} rows skipped) into ${binner.cells.length} cells.`,
  );

  if (args.tree) {
    const newick = readFileSync(args.tree, 'utf8');
    const tree = prepareTree(parseTree(newick));
    root.treeStore.tree = tree;
    root.treeStore.treeNodeMap = buildTreeNodeMap(tree);
    console.log(`Loaded tree with ${root.treeStore.treeNodeMap.size} named nodes.`);
  } else {
    infomapStore.includeTreeInNetwork = false;
    if (args.multilayer) {
      console.warn(
        'Warning: --multilayer without --tree. Layers only differ by tree ' +
        'integration time, so every layer will be identical.',
      );
    }
  }

  for (const key of [...INFOMAP_PARAMS, ...MULTILAYER_PARAMS]) {
    if (key in args.params) {
      (infomapStore as unknown as Record<string, unknown>)[key] = args.params[key];
    }
  }

  // Cell geometry travels with the network: the analysis weights every metric
  // by true spherical cell area, and cells range over 1-4 degrees.
  const cells = binner.cells.map((cell) => ({
    id: cell.id,
    x1: cell.x1,
    y1: cell.y1,
    x2: cell.x2,
    y2: cell.y2,
    numRecords: cell.features.length,
  }));

  const common = {
    parameterName: infomapStore.parameterName,
    source: {
      occurrences: args.occurrences,
      tree: args.tree ?? null,
      numOccurrences: features.length,
      numOccurrencesSkipped: numSkipped,
    },
    params: {
      ...Object.fromEntries(
        INFOMAP_PARAMS.map((k) => [k, (infomapStore as unknown as Record<string, unknown>)[k]]),
      ),
      ...Object.fromEntries(
        BINNER_PARAMS.map((k) => [k, (binner as unknown as Record<string, unknown>)[k]]),
      ),
    },
    cells,
  };

  const output = args.multilayer
    ? buildMultilayerOutput(infomapStore, common)
    : buildStandardOutput(infomapStore, common);

  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, JSON.stringify(output));
  console.log(`Wrote ${args.out}`);
  console.log(JSON.stringify(output.stats, null, 2));
}

type Common = {
  parameterName: string;
  source: Record<string, unknown>;
  params: Record<string, unknown>;
  cells: { id: string; x1: number; y1: number; x2: number; y2: number; numRecords: number }[];
};

/** Bipartite or state network, whichever `createNetwork()` decides on. */
function buildStandardOutput(
  infomapStore: InfomapStore,
  common: Common,
) {
  console.time('createNetwork');
  const network = infomapStore.createNetwork();
  console.timeEnd('createNetwork');

  const { nodes, links } = network;
  const states = 'states' in network ? network.states : undefined;

  return {
    ...common,
    networkType: states ? ('state' as const) : ('bipartite' as const),
    stats: {
      ...commonStats(network),
      numStates: states?.length ?? 0,
      numLinks: links.length,
    },
    bipartiteStartId: 'bipartiteStartId' in network ? network.bipartiteStartId : null,
    nodes,
    states: states ?? null,
    links,
  };
}

/**
 * Multilayer network: one layer per tree integration time, each layer being a
 * full `createStandardNetwork(t)`. Layers share the physical node ids but carry
 * no inter-layer links - `runMultilayer()` couples them with a relax rate
 * instead (`--multilayer-relax-rate 0.15 --multilayer-relax-limit 1`), so the
 * `inter` array below is normally null.
 */
function buildMultilayerOutput(
  infomapStore: InfomapStore,
  common: Common,
) {
  // `createMultilayerNetwork` runs its own `console.time('createMultilayerNetwork')`.
  const network: BioregionsMultilayerNetwork = infomapStore.createMultilayerNetwork();

  const { nodes, intra, inter, layers } = network;
  const intraPerLayer = layers.map(
    (layer) => intra.filter((link) => link.layerId === layer.id).length,
  );

  return {
    ...common,
    networkType: 'multilayer' as const,
    params: {
      ...common.params,
      ...Object.fromEntries(
        MULTILAYER_PARAMS.map((k) => [
          k,
          (infomapStore as unknown as Record<string, unknown>)[k],
        ]),
      ),
    },
    stats: {
      ...commonStats(network),
      numLayers: layers.length,
      numNodes: nodes?.length ?? 0,
      numIntraLinks: intra.length,
      numInterLinks: inter?.length ?? 0,
      numIntraLinksPerLayer: intraPerLayer,
      numCells: common.cells.length,
    },
    // `createMultilayerNetwork` drops the bipartite split, and `runMultilayer`
    // does not restore it, so the multilayer run is unipartite in the app too.
    bipartiteStartId: null,
    layers,
    nodes: nodes ?? [],
    intra,
    inter: inter ?? null,
  };
}

main();
