// DataStore: the two slots, commit-on-first-feature file loads, tree loads, remove and
// clear, the methods text and citations, and the single-load guard. The real TreeStore
// validates trees; SpeciesStore, Infomap and the map are stubs that record call order.
import { action, autorun, makeAutoObservable } from 'mobx';
import { describe, expect, it, vi } from 'vitest';
import DataStore, { LOAD_RUNNING } from './DataStore';
import type RootStore from './RootStore';
import { NO_USABLE_ROWS, type FileLoadOptions } from './SpeciesStore';
import TreeStore from './TreeStore';
import { EXAMPLE_CITATION_PLACEHOLDER, exampleCatalog, type ExampleEntry } from './data/catalog';
import type { UploadPlan } from './data/classify';
import type { TreeLoadInput } from './data/types';

const TREE = '((Aa_a:1,Bb_b:1):1,Cc_c:2);';
const TREE2 = '(Xx_x,Yy_y);';

/** How the fake SpeciesStore behaves for one file name. */
type Script = { features: number; error?: string; gate?: Promise<void>; postLoad?: boolean };

function setup(scripts: Record<string, Script> = {}) {
  const calls: string[] = [];
  const speciesStore = makeAutoObservable(
    {
      name: 'data',
      loaded: false,
      isLoading: false,
      numRecords: 0,
      numSpecies: 0,
      numPolygonsDebounced: 0,
      cleared: 0,
      speciesMap: new Map<string, unknown>(),
      binner: {
        setMinCellSizeLog2: vi.fn(),
        setMaxCellSizeLog2: vi.fn(),
        setMinCellCapacity: vi.fn(),
        setMaxCellCapacity: vi.fn(),
      },
      clearData() {
        calls.push('species.clearData');
        this.cleared += 1;
        this.loaded = false;
        this.numRecords = 0;
        this.numSpecies = 0;
        this.speciesMap = new Map();
      },
    },
    { binner: false, clearData: action },
  );
  const fakeLoad = async (file: unknown, opts: FileLoadOptions = {}) => {
    const name = typeof file === 'string' ? file : (file as File).name;
    const script = scripts[name] ?? { features: 2 };
    calls.push(`species.load ${name}`);
    await script.gate;
    if (script.features === 0) throw new Error(script.error ?? NO_USABLE_ROWS);
    action(() => {
      opts.onFirstRecord?.();
      speciesStore.numRecords = script.features;
      speciesStore.numSpecies = 2;
      speciesStore.speciesMap = new Map([
        ['Aa a', {}],
        ['Zz z', {}],
      ]);
      speciesStore.loaded = true;
    })();
    // The real SpeciesStore.postLoad runs Infomap once after a committed load.
    if (script.postLoad) await (infomapStore as unknown as { run: () => Promise<void> }).run();
    if (script.error) throw new Error(script.error);
    return { received: script.features };
  };
  const speciesLoad = vi.fn(fakeLoad);
  Object.assign(speciesStore, {
    load: speciesLoad,
    loadShapefile: vi.fn((files: unknown, opts: FileLoadOptions = {}) =>
      fakeLoad(Array.isArray(files) ? files[0] : files, opts),
    ),
    loadString: vi.fn((_csv: string, opts: FileLoadOptions = {}) => fakeLoad('inline.csv', opts)),
  });
  const infomapStore = makeAutoObservable(
    {
      includeTreeInNetwork: true,
      cleared: 0,
      clearData() {
        calls.push('infomap.clearData');
        this.cleared += 1;
      },
      setIncludeTree(value: boolean) {
        this.includeTreeInNetwork = value;
      },
      updateNetwork() {},
    },
    {},
  );
  const run = vi.fn(async () => {
    calls.push('infomap.run');
  });
  Object.assign(infomapStore, { run });
  const mapStore = { setRenderType: vi.fn(), render: vi.fn() };
  const root = { speciesStore, infomapStore, mapStore } as unknown as RootStore;
  const treeStore = new TreeStore(root);
  root.treeStore = treeStore;
  const store = new DataStore(root);
  root.dataStore = store;
  return { store, speciesStore, infomapStore, treeStore, run, speciesLoad, fakeLoad, calls };
}

const csv = (name: string) => ({
  format: 'csv' as const,
  file: new File(['x'], name),
  columns: { name: 'species', lat: 'latitude', long: 'longitude' },
});

const fileTree = (text: string, name = 'tree.nwk'): TreeLoadInput => ({ kind: 'file', file: new File([text], name) });

/** A `files` catalog entry; the citation defaults to the placeholder, as the catalog sets it. */
function filesExample(o: {
  id: string;
  title?: string;
  species: string;
  tree?: string;
  treeCitation?: string;
  citation?: string;
  settings?: NonNullable<ExampleEntry['files']>['settings'];
}): ExampleEntry {
  return {
    id: o.id,
    title: o.title ?? o.id,
    kind: 'files',
    why: '',
    icon: 'map',
    taxon: 'Mammalia',
    region: 'World',
    source: 'Example',
    records: { n: 2, approx: false },
    species: { n: 2, approx: false },
    size: '1 kB download',
    citation: o.citation ?? EXAMPLE_CITATION_PLACEHOLDER,
    tree: {
      included: Boolean(o.tree),
      usedByDefault: Boolean(o.tree) && o.settings?.includeTree !== false,
      ...(o.treeCitation ? { citation: o.treeCitation } : {}),
    },
    files: { species: o.species, ...(o.tree ? { tree: o.tree } : {}), settings: o.settings ?? {} },
  };
}

const openTree = (newick = TREE): TreeLoadInput => ({
  kind: 'opentree',
  newick,
  label: 'Open Tree synthesis',
  candidate: { id: 'synth', kind: 'synthetic', title: 'Synthesis', citation: 'OpenTree 2024.', year: 2024 },
  grafen: true,
  selection: { kept: 3, absentFromTree: [], pruned: 0, broken: [] },
  matchedFrom: 'loaded',
  citation: 'Open Tree of Life synthetic tree v15.1 (2024).',
});

describe('DataStore occurrence files', () => {
  it('commits a file load on the first feature as one file source; clear() empties both slots', async () => {
    const { store } = setup();
    const result = await store.loadOccurrenceFile(csv('birds.csv'));
    expect(result).toEqual({ started: true, committed: true });
    expect(store.sources).toHaveLength(1);
    expect(store.occurrence).toMatchObject({
      kind: 'file',
      format: 'csv',
      label: 'birds.csv',
      exportName: 'birds',
      status: 'done',
      files: [{ name: 'birds.csv', size: 1 }],
      columns: { name: 'species', lat: 'latitude', long: 'longitude' },
    });
    expect(store.occurrence?.completedAt).not.toBeNull();
    // SpeciesStore.name is a computed over `occurrence.exportName` (S2a).
    expect(store.job).toMatchObject({ state: 'done', committed: true, kind: 'file', origin: 'upload' });

    await store.loadTree(openTree());
    expect(store.sources.map((s) => s.role)).toEqual(['occurrences', 'tree']);
    expect(store.clear()).toBe(true);
    expect(store.sources).toEqual([]);
    expect(store.occurrence).toBeNull();
    expect(store.tree).toBeNull();
  });

  it.each([
    ['a parse failure', { features: 0, error: 'Unexpected end of file' }, 'Unexpected end of file'],
    ['a file with no usable rows', { features: 0 }, NO_USABLE_ROWS],
  ])('%s keeps the previous source and data and sets job.error', async (_what, script, message) => {
    const { store, speciesStore, calls } = setup({ 'bad.csv': script });
    await store.loadOccurrenceFile(csv('good.csv'));
    const previous = store.occurrence;
    const cleared = speciesStore.cleared;
    calls.length = 0;
    const result = await store.loadOccurrenceFile(csv('bad.csv'));
    expect(result).toEqual({ started: true, committed: false });
    expect(store.occurrence).toBe(previous);
    expect(speciesStore.cleared).toBe(cleared);
    expect(speciesStore.loaded).toBe(true);
    expect(calls).not.toContain('infomap.clearData');
    expect(store.job).toMatchObject({ state: 'error', error: message, committed: false });
  });

  it('keeps what arrived when the file fails after the commit', async () => {
    const { store } = setup({ 'half.csv': { features: 3, error: 'Broken row' } });
    await store.loadOccurrenceFile(csv('half.csv'));
    expect(store.occurrence).toMatchObject({ label: 'half.csv', status: 'done' });
    expect(store.job).toMatchObject({ state: 'error', error: 'Broken row', committed: true });
  });

  it('labels a shapefile load by its .shp or .zip file', async () => {
    const { store } = setup();
    const files = [new File(['x'], 'ranges.dbf'), new File(['x'], 'ranges.shp')];
    await store.loadOccurrenceFile({ format: 'shapefile', files });
    expect(store.occurrence).toMatchObject({ kind: 'file', format: 'shapefile', label: 'ranges.shp', exportName: 'ranges' });
    expect(store.occurrence?.kind === 'file' && store.occurrence.files).toHaveLength(2);
  });

  it('commitOccurrence clears species and Infomap and swaps the slot in one action', async () => {
    const { store, speciesStore, infomapStore } = setup();
    await store.loadOccurrenceFile(csv('first.csv'));
    const seen: string[] = [];
    const dispose = autorun(() => {
      seen.push(`${store.occurrence?.label}|${speciesStore.cleared}|${infomapStore.cleared}`);
    });
    store.commitOccurrence({
      id: 'src-x',
      role: 'occurrences',
      kind: 'file',
      format: 'csv',
      files: [],
      label: 'second.csv',
      exportName: 'second',
      status: 'loading',
      retrievedAt: '2026-10-31T00:00:00.000Z',
      completedAt: null,
    });
    dispose();
    // The initial run, then exactly one run with all three changed together.
    expect(seen).toEqual(['first.csv|1|1', 'second.csv|2|2']);
  });
});

describe('DataStore trees', () => {
  it('a tree load keeps the occurrence source, and an occurrence load keeps the tree (I8)', async () => {
    const { store } = setup();
    await store.loadOccurrenceFile(csv('birds.csv'));
    const occurrence = store.occurrence;
    await store.loadTree(fileTree(TREE));
    expect(store.occurrence).toBe(occurrence);
    expect(store.tree).toMatchObject({ kind: 'file', tips: 3, file: { name: 'tree.nwk' }, status: 'done' });
    const tree = store.tree;
    await store.loadOccurrenceFile(csv('fish.csv'));
    expect(store.tree).toBe(tree);
    expect(store.occurrence?.label).toBe('fish.csv');
  });

  it('an invalid tree sets treeJob.error and changes nothing', async () => {
    const { store, treeStore, run } = setup();
    await store.loadTree(openTree());
    const tree = store.tree;
    const loaded = treeStore.tree;
    const result = await store.loadTree(fileTree('species,lat,long\nA,1,2', 'oops.tree'));
    expect(result).toEqual({ started: true, committed: false });
    expect(store.tree).toBe(tree);
    expect(treeStore.tree).toBe(loaded);
    expect(store.treeJob).toMatchObject({ state: 'error', label: 'oops.tree' });
    expect(store.treeJob?.error).toMatch(/Not a valid Newick tree/);
    expect(run).not.toHaveBeenCalled();
  });

  it('reruns Infomap after a tree load only when occurrences are loaded', async () => {
    const { store, run } = setup();
    await store.loadTree(openTree());
    expect(run).not.toHaveBeenCalled();
    await store.loadOccurrenceFile(csv('birds.csv'));
    run.mockClear();
    await store.loadTree(openTree(TREE2));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('removeTree() resets the tree store and reruns Infomap only with occurrences loaded', async () => {
    const { store, treeStore, run } = setup();
    await store.loadTree(openTree());
    const reset = vi.spyOn(treeStore, 'reset');
    expect(await store.removeTree()).toBe(true);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(store.tree).toBeNull();
    expect(treeStore.tree).toBeNull();
    expect(run).not.toHaveBeenCalled();

    await store.loadOccurrenceFile(csv('birds.csv'));
    await store.loadTree(openTree());
    run.mockClear();
    await store.removeTree();
    expect(reset).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenCalledTimes(1);
    expect(store.occurrence).not.toBeNull();
  });

  it('removeOccurrences() keeps the tree', async () => {
    const { store, speciesStore, calls } = setup();
    await store.loadOccurrenceFile(csv('birds.csv'));
    await store.loadTree(openTree());
    calls.length = 0;
    expect(store.removeOccurrences()).toBe(true);
    expect(calls).toEqual(['species.clearData', 'infomap.clearData']);
    expect(store.occurrence).toBeNull();
    expect(store.tree).not.toBeNull();
    expect(speciesStore.loaded).toBe(false);
  });

  it('loadTree with rerun and includeTree off leaves includeTreeInNetwork false and does not run Infomap', async () => {
    const { store, infomapStore, run } = setup();
    await store.loadOccurrenceFile(csv('birds.csv'));
    run.mockClear();
    await store.loadTree(openTree(), { rerun: false, includeTree: false });
    expect(infomapStore.includeTreeInNetwork).toBe(false);
    expect(run).not.toHaveBeenCalled();
    expect(store.tree?.kind).toBe('opentree');
  });
});

describe('DataStore single-load guard', () => {
  it('refuses a second occurrence load and commits a tree without running Infomap while a file loads', async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { store, run } = setup({ 'slow.csv': { features: 2, gate } });
    await store.loadOccurrenceFile(csv('birds.csv'));
    run.mockClear();
    const running = store.loadOccurrenceFile(csv('slow.csv'));
    expect(store.isLoading).toBe(true);
    expect(await store.loadOccurrenceFile(csv('other.csv'))).toEqual({ started: false, reason: LOAD_RUNNING });
    expect(await store.loadExample(filesExample({ id: 'ex', species: '/ex.csv' }))).toEqual({ started: false, reason: LOAD_RUNNING });
    expect(store.removeOccurrences()).toBe(false);
    expect(store.clear()).toBe(false);

    await store.loadTree(openTree());
    expect(store.tree?.kind).toBe('opentree');
    expect(run).not.toHaveBeenCalled();

    release();
    await running;
    expect(store.isLoading).toBe(false);
    expect(store.occurrence?.label).toBe('slow.csv');
  });
});

describe('DataStore methods text and citations', () => {
  it('is empty when nothing is loaded', () => {
    const { store } = setup();
    expect(store.methodsText).toBe('');
    expect(store.citations).toEqual([]);
  });

  it('says "Loading …" for a loading source and cites nothing for it', async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { store, speciesLoad } = setup();
    speciesLoad.mockImplementationOnce(async (_file, opts = {}) => {
      opts.onFirstRecord?.();
      await gate;
      return { received: 1 };
    });
    const running = store.loadExample(
      filesExample({ id: 'ex', title: 'Birds of Europe', species: '/data/birds.csv', citation: 'Bird atlas (2020).' }),
    );
    await vi.waitFor(() => expect(store.occurrence?.status).toBe('loading'));
    expect(store.methodsText).toBe('Loading Birds of Europe…');
    expect(store.citations).toEqual([]);
    release();
    await running;
    expect(store.citations).toMatchObject([{ kind: 'example', text: 'Bird atlas (2020).' }]);
  });

  it('describes a file and a file tree, with no citation', async () => {
    const { store } = setup();
    await store.loadOccurrenceFile(csv('birds.csv'));
    await store.loadTree(fileTree(TREE));
    expect(store.methodsText).toBe(
      'Occurrence data were loaded from the file birds.csv (2 records of 2 species). ' +
        'Phylogeny: user-provided Newick tree tree.nwk (3 tips).',
    );
    expect(store.citations).toEqual([]);
  });

  it('describes an example with its tree and citations, or the placeholder', async () => {
    const { store } = setup();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(TREE)));
    await store.loadExample(
      filesExample({
        id: 'mammals',
        title: 'Neotropical mammals',
        species: '/data/mammals.csv',
        tree: '/data/mammals.nwk',
        treeCitation: 'Mammal tree (2008)',
      }),
    );
    vi.unstubAllGlobals();
    expect(store.tree).toMatchObject({ kind: 'example', exampleId: 'mammals', tips: 3 });
    expect(store.methodsText).toBe(
      'Occurrence data: the Infomap Bioregions example "Neotropical mammals" (2 records of 2 species). ' +
        'Source: Infomap Bioregions example data. Phylogeny: Mammal tree (2008).',
    );
    expect(store.citations).toMatchObject([{ kind: 'example', text: 'Mammal tree (2008)' }]);
  });

  it('uses the frozen Open Tree citation', async () => {
    const { store } = setup();
    await store.loadTree(openTree());
    expect(store.methodsText).toBe('Open Tree of Life synthetic tree v15.1 (2024).');
    expect(store.citations).toMatchObject([
      { kind: 'opentree', text: 'Open Tree of Life synthetic tree v15.1 (2024).', sourceId: store.tree?.id },
    ]);
    expect(store.treeOverlap).toEqual({ tips: 3, inTree: 0, datasetSpecies: 0 });
  });
});

describe('DataStore.loadInline', () => {
  it('creates two docs-demo example sources', async () => {
    const { store } = setup();
    const result = await store.loadInline({ label: 'Demo', csv: 'species,longitude,latitude\nAa a,1,2', newick: TREE });
    expect(result).toEqual({ started: true, committed: true });
    expect(store.sources).toMatchObject([
      { role: 'occurrences', kind: 'example', exampleId: 'docs-demo', status: 'done' },
      { role: 'tree', kind: 'example', exampleId: 'docs-demo', tips: 3 },
    ]);
    expect(store.treeOverlap).toEqual({ tips: 3, inTree: 1, datasetSpecies: 2 });
  });
});

describe('DataStore.loadExample (catalog)', () => {
  const catalogEntry = (id: string) => {
    const entry = exampleCatalog(true).find((e) => e.id === id);
    if (!entry?.files) throw new Error(`no files example ${id}`);
    return entry as ExampleEntry & { files: NonNullable<ExampleEntry['files']> };
  };

  it('Global mammals (includeTree: false) leaves includeTreeInNetwork false and runs Infomap exactly once', async () => {
    const entry = catalogEntry('mammals-global');
    expect(entry.files.settings.includeTree).toBe(false);
    const { store, infomapStore, run } = setup({ [entry.files.species]: { features: 2, postLoad: true } });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(TREE)));
    const result = await store.loadExample(entry);
    vi.unstubAllGlobals();
    expect(result).toEqual({ started: true, committed: true });
    expect(infomapStore.includeTreeInNetwork).toBe(false);
    expect(run).toHaveBeenCalledTimes(1);
    expect(store.tree).toMatchObject({ kind: 'example', exampleId: 'mammals-global' });
    expect(store.occurrence).toMatchObject({ kind: 'example', exampleId: 'mammals-global', label: entry.title });
  });

  it('fills both slots tree-first, with includeTree on', async () => {
    const entry = catalogEntry('mammals-neotropics');
    const { store, infomapStore, run, speciesLoad, fakeLoad } = setup({
      [entry.files.species]: { features: 2, postLoad: true },
    });
    let treeAtLoad: string | undefined;
    speciesLoad.mockImplementationOnce(async (file, opts) => {
      treeAtLoad = store.tree?.kind;
      return fakeLoad(file, opts);
    });
    infomapStore.setIncludeTree(false);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(TREE)));
    await store.loadExample(entry);
    vi.unstubAllGlobals();
    expect(treeAtLoad).toBe('example');
    expect(infomapStore.includeTreeInNetwork).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    expect(store.occurrence).toMatchObject({ kind: 'example', exampleId: 'mammals-neotropics' });
  });

  it('freezes a documented catalog citation', async () => {
    const entry = catalogEntry('birches');
    expect(entry.citation).not.toBe(EXAMPLE_CITATION_PLACEHOLDER);
    const { store } = setup();
    await store.loadExample(entry);
    expect(store.occurrence).toMatchObject({ kind: 'example', exampleId: 'birches', citation: entry.citation });
  });

  it('does not freeze the placeholder citation (§9.3)', async () => {
    const { store } = setup();
    await store.loadExample(filesExample({ id: 'plain', species: '/plain.csv' }));
    expect(store.occurrence).toMatchObject({ kind: 'example', exampleId: 'plain' });
    expect(store.occurrence && 'citation' in store.occurrence).toBe(false);
    expect(store.methodsText).toContain(`${EXAMPLE_CITATION_PLACEHOLDER}.`);
  });

  it('keeps a leftover tree for an example without one, with its overlap available (§9.2)', async () => {
    const { store, run } = setup({ '/plain.csv': { features: 2, postLoad: true } });
    await store.loadTree(fileTree(TREE));
    const treeId = store.tree?.id;
    await store.loadExample(filesExample({ id: 'plain', species: '/plain.csv' }));
    expect(store.tree?.id).toBe(treeId);
    expect(store.treeOverlap).toMatchObject({ tips: 3, inTree: 1, datasetSpecies: 2 });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('reruns Infomap once when the tree committed but the occurrences did not', async () => {
    const { store, run } = setup({ '/empty.csv': { features: 0 } });
    await store.loadOccurrenceFile(csv('birds.csv'));
    run.mockClear();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(TREE)));
    const result = await store.loadExample(filesExample({ id: 'empty', species: '/empty.csv', tree: '/t.nwk' }));
    vi.unstubAllGlobals();
    expect(result).toEqual({ started: true, committed: false });
    expect(store.occurrence?.label).toBe('birds.csv');
    expect(store.tree?.kind).toBe('example');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('delegates a query example to explorerStore.loadExampleQuery', async () => {
    const { store } = setup();
    const loadExampleQuery = vi.fn(async () => ({ started: true as const, committed: true }));
    (store.rootStore as unknown as { explorerStore: unknown }).explorerStore = { loadExampleQuery };
    const entry = exampleCatalog().find((e) => e.kind === 'query');
    if (!entry) throw new Error('no query example');
    expect(await store.loadExample(entry)).toEqual({ started: true, committed: true });
    expect(loadExampleQuery).toHaveBeenCalledWith(entry);
  });
});

describe('DataStore.loadUpload', () => {
  const plan = (p: Partial<UploadPlan>): UploadPlan => ({ occurrences: null, tree: null, ignored: [], errors: [], ...p });
  const columns = { name: 'species', lat: 'latitude', long: 'longitude' };

  it('loads a csv and a tree: tree first, one Infomap run', async () => {
    const { store, run, speciesLoad, fakeLoad } = setup({ 'birds.csv': { features: 2, postLoad: true } });
    let treeAtLoad: string | undefined;
    speciesLoad.mockImplementationOnce(async (file, opts) => {
      treeAtLoad = store.tree?.kind;
      return fakeLoad(file, opts);
    });
    const files = [new File(['x'], 'birds.csv'), new File([TREE], 'birds.nwk')];
    const result = await store.loadUpload(
      files,
      plan({ occurrences: { kind: 'points', format: 'csv', file: 0 }, tree: { kind: 'tree', file: 1 } }),
      columns,
    );
    expect(result).toEqual({ started: true, committed: true });
    expect(treeAtLoad).toBe('file');
    expect(run).toHaveBeenCalledTimes(1);
    expect(store.occurrence).toMatchObject({ kind: 'file', label: 'birds.csv', columns });
    expect(store.tree).toMatchObject({ kind: 'file', tips: 3 });
  });

  it('a tree alone reruns Infomap when occurrences are loaded', async () => {
    const { store, run } = setup();
    await store.loadOccurrenceFile(csv('birds.csv'));
    run.mockClear();
    const result = await store.loadUpload([new File([TREE], 't.nwk')], plan({ tree: { kind: 'tree', file: 0 } }));
    expect(result).toEqual({ started: true, committed: true });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('loads a shapefile zip and loose shapefile parts', async () => {
    const { store, speciesStore } = setup();
    const zip = new File(['z'], 'ranges.zip');
    await store.loadUpload([zip], plan({ occurrences: { kind: 'shapefile-zip', file: 0 } }));
    expect(store.occurrence).toMatchObject({ kind: 'file', format: 'shapefile', label: 'ranges.zip' });
    const shp = new File(['s'], 'r.shp');
    const dbf = new File(['d'], 'r.dbf');
    await store.loadUpload([dbf, shp], plan({ occurrences: { kind: 'shapefile', files: [1, 0] } }));
    expect((speciesStore as unknown as { loadShapefile: ReturnType<typeof vi.fn> }).loadShapefile).toHaveBeenLastCalledWith(
      [shp, dbf],
      expect.anything(),
    );
    expect(store.occurrence?.label).toBe('r.shp');
  });

  it('refuses a plan with errors, points without columns, and a running load; an invalid tree stops the upload', async () => {
    const { store, speciesLoad } = setup();
    const files = [new File(['x'], 'a.csv'), new File(['((('], 'bad.nwk')];
    expect(await store.loadUpload(files, plan({ errors: ['No files'] }))).toEqual({ started: false, reason: 'No files' });
    expect(await store.loadUpload(files, plan({ occurrences: { kind: 'points', format: 'csv', file: 0 } }))).toMatchObject({
      started: false,
    });
    const result = await store.loadUpload(
      files,
      plan({ occurrences: { kind: 'points', format: 'csv', file: 0 }, tree: { kind: 'tree', file: 1 } }),
      columns,
    );
    expect(result).toEqual({ started: true, committed: false });
    expect(store.treeJob?.state).toBe('error');
    expect(speciesLoad).not.toHaveBeenCalled();
    expect(store.occurrence).toBeNull();
  });
});
