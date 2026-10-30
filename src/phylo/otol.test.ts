import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchStudyTree,
  findStudyTrees,
  inducedSubtree,
  matchNames,
  mrca,
  normalizeDoi,
  otolCitation,
  studyCitation,
  studyTipOttId,
  synthesisInfo,
} from './otol';

// Fixtures trimmed from live responses (api.opentreeoflife.org/v3, opentree16.1).
const taxon = (ott_id: number, name: string, extra: Record<string, unknown> = {}) => ({
  ott_id,
  name,
  unique_name: name,
  rank: 'species',
  flags: [],
  is_suppressed: false,
  is_suppressed_from_synth: false,
  ...extra,
});
const match = (name: string, t: ReturnType<typeof taxon>, extra: Record<string, unknown> = {}) => ({
  is_approximate_match: false,
  is_synonym: false,
  matched_name: name,
  score: 1,
  taxon: t,
  ...extra,
});
const QUERCUS = taxon(239659, 'Quercus robur');
const PUMA = taxon(42307, 'Puma concolor');

function tnrs(body: { names: string[]; do_approximate_matching: boolean }) {
  return {
    context: 'All life',
    results: body.names.map((name) => {
      if (name === 'Quercus robur') return { name, matches: [match(name, QUERCUS)] };
      if (name === 'Quercus pedunculata') return { name, matches: [match(name, QUERCUS, { is_synonym: true })] };
      if (name === 'Pumma concolor' && body.do_approximate_matching) {
        return {
          name,
          matches: [
            match('Euomma concolor', taxon(5064411, 'Euomma concolor', { is_suppressed_from_synth: true }), {
              is_approximate_match: true,
              score: 0.87,
            }),
            match('Puma concolor', PUMA, { is_approximate_match: true, score: 0.92 }),
          ],
        };
      }
      return { name, matches: [] };
    }),
  };
}

type Handler = (url: string, body: unknown) => { status?: number; json?: unknown; text?: string };

function mockFetch(handler: Handler) {
  const calls: { url: string; body: unknown }[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    const { status = 200, json, text } = handler(url, body);
    return new Response(text ?? JSON.stringify(json), { status });
  });
  vi.stubGlobal('fetch', fn);
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('matchNames', () => {
  it('matches exactly first, then fuzzily, keeping input order', async () => {
    const calls = mockFetch((_url, body) => ({ json: tnrs(body as never) }));
    const progress: [number, number][] = [];
    const names = ['Quercus pedunculata', 'Pumma concolor', 'Quercus robur', 'Xyzzy foo', 'Quercus robur', ''];
    const result = await matchNames(names, { onProgress: (d, t) => progress.push([d, t]), contextName: 'All life' });

    expect(result.map((r) => r.ottId)).toEqual([239659, 42307, 239659, undefined, 239659, undefined]);
    expect(result[0]).toMatchObject({ input: 'Quercus pedunculata', ottName: 'Quercus robur', isSynonym: true });
    expect(result[1]).toMatchObject({ isApproximate: true, score: 0.92, inSynthesis: true });
    expect(result[3]).toEqual({ input: 'Xyzzy foo', isSynonym: false, isApproximate: false });
    expect(calls).toHaveLength(2);
    expect((calls[0].body as { names: string[] }).names).toHaveLength(4);
    expect(calls[0].body).toMatchObject({ do_approximate_matching: false, context_name: 'All life' });
    expect(calls[1].body).toMatchObject({ names: ['Pumma concolor', 'Xyzzy foo'], do_approximate_matching: true });
    expect(progress[progress.length - 1]).toEqual([4, 4]);
  });

  it('batches large inputs', async () => {
    const calls = mockFetch((_url, body) => ({ json: tnrs(body as never) }));
    const names = Array.from({ length: 600 }, (_, i) => `Species ${i}`);
    const result = await matchNames(names, { approximate: false });
    expect(result).toHaveLength(600);
    expect(calls.map((c) => (c.body as { names: string[] }).names.length)).toEqual([250, 250, 100]);
  });
});

describe('synthetic tree', () => {
  it('drops ids the API rejects and retries', async () => {
    const calls = mockFetch((_url, body) => {
      const ids = (body as { ott_ids: number[] }).ott_ids;
      if (ids.includes(5064411) || ids.includes(999999999)) {
        return {
          status: 400,
          json: {
            message: "[/v3/tree_of_life/induced_subtree] Error: node_id 'ott5064411' was not found!",
            unknown: { ott5064411: 'pruned_ott_id', ott999999999: 'invalid_ott_id' },
          },
        };
      }
      return { json: { broken: {}, newick: '((ott42307)mrcaott1ott2,ott563151)ott563159;', supporting_studies: [] } };
    });
    const result = await inducedSubtree([42307, 5064411, 563151, 999999999, 42307]);
    expect(result).toEqual({
      newick: '((ott42307)mrcaott1ott2,ott563151)ott563159;',
      broken: {},
      missing: [5064411, 999999999],
    });
    expect(calls[0].body).toEqual({ ott_ids: [42307, 5064411, 563151, 999999999], label_format: 'id' });
    expect(calls).toHaveLength(2);
  });

  it('throws when nothing is left or the error is not about ids', async () => {
    mockFetch(() => ({ status: 400, json: { message: 'x', unknown: { ott1: 'invalid_ott_id' } } }));
    await expect(inducedSubtree([1])).rejects.toThrow('None of the taxa');
    mockFetch(() => ({ status: 400, json: { message: 'bad request' } }));
    await expect(inducedSubtree([1, 2])).rejects.toThrow('HTTP 400');
  });

  it('reads the MRCA taxon or the nearest enclosing taxon', async () => {
    mockFetch(() => ({
      json: {
        mrca: { node_id: 'ott563159', num_tips: 91, taxon: { name: 'Felidae', ott_id: 563159, rank: 'family', unique_name: 'Felidae' } },
        synth_id: 'opentree16.1',
      },
    }));
    expect(await mrca([42307, 563151])).toEqual({
      name: 'Felidae',
      ottId: 563159,
      rank: 'family',
      numTips: 91,
      nodeId: 'ott563159',
      isTaxon: true,
    });
    mockFetch(() => ({
      json: {
        mrca: { node_id: 'mrcaott54737ott442049', num_tips: 52 },
        nearest_taxon: { name: 'Felidae', ott_id: 563159, rank: 'family', unique_name: 'Felidae' },
        synth_id: 'opentree16.1',
      },
    }));
    expect(await mrca([42307, 507549])).toMatchObject({ name: 'Felidae', numTips: 52, isTaxon: false });
  });

  it('reads the synthesis version and cites it', async () => {
    mockFetch(() => ({
      json: { date_created: '2025-12-20 00:55:58', synth_id: 'opentree16.1', taxonomy_version: '3.7draft3' },
    }));
    const info = await synthesisInfo();
    expect(info).toMatchObject({ synthId: 'opentree16.1', date: '2025-12-20', taxonomyVersion: '3.7draft3' });
    expect(info.citation).toContain('opentree16.1 (2025-12-20)');
    expect(info.citation).toContain('Hinchliff');
    expect(otolCitation()).toContain('10.1073/pnas.1423041112');
  });
});

describe('study trees', () => {
  const findTrees = (studies: unknown[]) => ({ matched_studies: studies });
  const STUDY = {
    'ot:studyId': 'ot_2260',
    'ot:studyPublicationReference': 'Soares, P., et al. (2013). PLoS ONE 8(3): e58993.',
    'ot:studyPublication': 'http://dx.doi.org/10.1371/journal.pone.0058993',
    'ot:studyYear': 2013,
    'ot:focalCladeOTTTaxonName': '',
    'ot:curatorName': ['James Waterford'],
    matched_trees: [
      { 'ot:treeId': 'tree1', 'ot:studyId': 'ot_2260', 'ot:proposedForSynthesis': false, '@label': 'Various Mammalia', 'ot:branchLengthMode': 'ot:time', 'ot:branchLengthDescription': '' },
    ],
  };
  const OLD = {
    'ot:studyId': 'pg_1850',
    'ot:studyPublicationReference': 'Fulton T., & Strobeck C. 2006. Molecular phylogeny of the Arctoidea.',
    'ot:studyPublication': 'http://dx.doi.org/10.1016/j.ympev.2006.05.025',
    'ot:studyYear': 2006,
    'ot:focalCladeOTTTaxonName': 'Carnivora',
    'ot:curatorName': 'Chris Owen',
    matched_trees: [
      { 'ot:treeId': 'tree3735', '@label': null, 'ot:branchLengthMode': 'ot:changesCount' },
      { 'ot:treeId': 'tree3735', '@label': null, 'ot:branchLengthMode': 'ot:changesCount' },
    ],
  };

  it('finds, normalizes, deduplicates and sorts trees', async () => {
    const calls = mockFetch(() => ({ json: findTrees([OLD, STUDY]) }));
    const trees = await findStudyTrees({ ottId: 563159, taxonName: 'Felidae' });
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual({ property: 'ot:ottId', value: '563159', verbose: true });
    expect(trees).toHaveLength(2);
    expect(trees[0]).toEqual({
      studyId: 'ot_2260',
      treeId: 'tree1',
      label: 'Various Mammalia',
      reference: 'Soares, P., et al. (2013). PLoS ONE 8(3): e58993.',
      year: 2013,
      doi: 'https://doi.org/10.1371/journal.pone.0058993',
      focalClade: undefined,
      branchLengthMode: 'ot:time',
      timeUnit: undefined,
      isDated: true,
      curator: 'James Waterford',
      proposedForSynthesis: false,
    });
    expect(trees[1]).toMatchObject({ studyId: 'pg_1850', isDated: false, focalClade: 'Carnivora', curator: 'Chris Owen' });
    expect(studyCitation(trees[1])).toContain('https://doi.org/10.1016/j.ympev.2006.05.025');
  });

  it('falls back to the taxon name', async () => {
    const calls = mockFetch((_url, body) => ({
      json: findTrees((body as { property: string }).property === 'ot:ottTaxonName' ? [STUDY] : []),
    }));
    const trees = await findStudyTrees({ ottId: 1, taxonName: 'Felidae' });
    expect(trees).toHaveLength(1);
    expect(calls.map((c) => (c.body as { property: string }).property)).toEqual(['ot:ottId', 'ot:ottTaxonName']);
  });

  it('downloads a study tree labelled by OTT id', async () => {
    const calls = mockFetch(() => ({ text: '((247341:0.027,821964:0.028):0.0645,563151:0.06);' }));
    const newick = await fetchStudyTree('pg_2684', 'tree6644');
    expect(newick).toContain('247341:0.027');
    expect(calls[0].url).toBe('https://api.opentreeoflife.org/v3/study/pg_2684/tree/tree6644.tre?tip_label=ot:ottId');
    expect(studyTipOttId('247341')).toBe(247341);
    expect(studyTipOttId('*tip #1 not mapped to OTT. Original label - Homo denisova')).toBeNull();
  });

  it('normalizes DOIs', () => {
    expect(normalizeDoi('http://dx.doi.org/10.1016/x')).toBe('https://doi.org/10.1016/x');
    expect(normalizeDoi('doi:10.1234/abc.1')).toBe('https://doi.org/10.1234/abc.1');
    expect(normalizeDoi('')).toBeUndefined();
  });
});

describe.skipIf(!process.env.LIVE_API)('live Open Tree API', () => {
  it('matches, builds a subtree and finds study trees', async () => {
    const matches = await matchNames(['Puma concolor', 'Panthera leo', 'Lynx canadensis']);
    const ids = matches.map((m) => m.ottId as number);
    expect(ids).toEqual([42307, 563151, 507549]);
    const subtree = await inducedSubtree([...ids, 5064411]);
    expect(subtree.missing).toEqual([5064411]);
    expect(subtree.newick).toContain('ott42307');
    expect((await mrca(ids)).name).toBe('Felidae');
    expect((await findStudyTrees({ ottId: 563159 })).length).toBeGreaterThan(0);
    expect(await fetchStudyTree('pg_2684', 'tree6644')).toMatch(/^\(\(/);
  }, 60_000);
});
