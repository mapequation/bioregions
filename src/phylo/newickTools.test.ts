import { describe, expect, it } from 'vitest';
import { read } from '@/utils/tree/newick';
import {
  cleanOttLabel,
  collapseUnary,
  grafenBranchLengths,
  type NewickNode,
  ottIdFromLabel,
  parseNewick,
  pruneToTips,
  relabelTips,
  tipLabels,
  treeStats,
  writeNewick,
} from './newickTools';

// Real responses (trimmed): induced_subtree for Puma concolor, Panthera leo and
// Lynx canadensis (opentree16.1), and the start of study pg_2684 tree6644.
const INDUCED =
  '(((((ott563151)mrcaott371429ott735488)mrcaott42318ott371429)ott563154)mrcaott19397ott882765,(((((((ott42307)ott86161)mrcaott86162ott752759)mrcaott54737ott86162,((ott507549)mrcaott442049ott507549)ott886828)mrcaott54737ott442049)mrcaott54737ott86175)mrcaott54737ott86170)mrcaott54737ott660452)ott563159;';
const STUDY =
  "(('Canis lupus':0.026999999999999996,'Vulpes vulpes':0.027999999999999997):0.0645,('Panthera leo':0.024999999999999994,'Lynx canadensis':0.016999999999999987):0.035);";

function caterpillar(n: number): NewickNode {
  let tree: NewickNode = { name: 't0', branchLength: 1, children: [] };
  for (let i = 1; i < n; i++) {
    tree = {
      name: '',
      branchLength: 1,
      children: [tree, { name: `t${i}`, branchLength: i, children: [] }],
    };
  }
  return tree;
}

describe('parseNewick', () => {
  it('reads quoted names with spaces and branch lengths', () => {
    const tree = parseNewick(STUDY);
    expect(tipLabels(tree)).toEqual(['Canis lupus', 'Vulpes vulpes', 'Panthera leo', 'Lynx canadensis']);
    expect(tree.children[0].branchLength).toBe(0.0645);
    expect(tree.children[0].children[0].branchLength).toBeCloseTo(0.027);
  });

  it('handles escapes, comments, whitespace and internal labels', () => {
    const tree = parseNewick("('O''Brien x':1,[note] B_c : 2 )root:0.5;\n");
    expect(tipLabels(tree)).toEqual(["O'Brien x", 'B_c']);
    expect(tree.children[1].branchLength).toBe(2);
    expect(tree.name).toBe('root');
    expect(tree.branchLength).toBe(0.5);
  });

  it('reads the Open Tree id-labelled synthetic tree', () => {
    const tree = parseNewick(INDUCED);
    expect(tipLabels(tree)).toEqual(['ott563151', 'ott42307', 'ott507549']);
    expect(tree.name).toBe('ott563159');
  });

  it('rejects unbalanced input', () => {
    expect(() => parseNewick('((A,B);')).toThrow();
    expect(() => parseNewick('(A,B));')).toThrow();
  });
});

describe('writeNewick', () => {
  it('round-trips and writes spaces as underscores the app reader understands', () => {
    const tree = parseNewick(STUDY);
    const text = writeNewick(tree);
    expect(text.startsWith('((Canis_lupus:0.026999999999999996,')).toBe(true);
    expect(tipLabels(parseNewick(text))[0]).toBe('Canis_lupus');
    const app = read(text);
    expect(app.children[1].children[0].name).toBe('Panthera_leo');
  });

  it('quotes labels with special characters', () => {
    const tree = parseNewick("('a,b':1,'it''s':2);");
    expect(writeNewick(tree)).toBe("('a,b':1,'it''s':2);");
    expect(writeNewick(parseNewick("('a b',c);"), { quoteSpaces: true })).toBe("('a b',c);");
  });
});

describe('tree operations', () => {
  it('collapses unary nodes of the induced subtree', () => {
    const tree = collapseUnary(parseNewick(INDUCED));
    expect(writeNewick(tree)).toBe('(ott563151,(ott42307,ott507549)mrcaott54737ott442049)ott563159;');
  });

  it('relabels tips, dropping nulls and duplicates', () => {
    const names: Record<string, string> = { ott563151: 'Panthera leo', ott42307: 'Puma concolor', ott507549: 'Puma concolor' };
    const out = relabelTips(parseNewick(INDUCED), (label) => names[label] ?? null);
    expect(out.kept).toBe(2);
    expect(out.dropped).toBe(1);
    expect(tipLabels(out.tree)).toEqual(['Panthera leo', 'Puma concolor']);
    expect(out.tree.children.every((c) => c.children.length === 0)).toBe(true);
  });

  it('prunes tips and sums branch lengths across collapsed nodes', () => {
    const tree = parseNewick('((A:1,B:2):3,(C:4,D:5):6)r;');
    const pruned = pruneToTips(tree, new Set(['A', 'C', 'D']));
    expect(writeNewick(pruned)).toBe('(A:4,(C:4,D:5):6)r;');
    expect(pruneToTips(tree, new Set())).toMatchObject({ name: '', children: [] });
  });

  it('computes Grafen branch lengths like ape::compute.brlen', () => {
    const tree = grafenBranchLengths(parseNewick('((A,B),(C,(D,E)));'));
    // N = 5: heights root 1, (A,B) 1/4, (C,(D,E)) 2/4, (D,E) 1/4.
    expect(writeNewick(tree)).toBe('((A:0.25,B:0.25):0.75,(C:0.5,(D:0.25,E:0.25):0.25):0.5);');
    const stats = treeStats(tree);
    expect(stats.isUltrametric).toBe(true);
    expect(stats.depth).toBe(1);
    const sq = treeStats(grafenBranchLengths(parseNewick('((A,B),(C,(D,E)));'), 0.5));
    expect(sq.isUltrametric).toBe(true);
  });

  it('summarizes topology', () => {
    expect(treeStats(parseNewick('((A,B,C),(D,E));'))).toEqual({
      tips: 5,
      internalNodes: 3,
      polytomies: 1,
      resolution: 2 / 3,
      hasBranchLengths: false,
      isUltrametric: false,
      depth: null,
    });
    const stats = treeStats(parseNewick(STUDY));
    expect(stats.hasBranchLengths).toBe(true);
    expect(stats.isUltrametric).toBe(false);
    expect(stats.depth).toBeCloseTo(0.0925);
  });

  it('cleans Open Tree labels', () => {
    expect(cleanOttLabel('Homo_sapiens_ott770315')).toBe('Homo_sapiens');
    expect(cleanOttLabel('Homo sapiens ott770315')).toBe('Homo sapiens');
    expect(cleanOttLabel('ott770315')).toBe('');
    expect(cleanOttLabel('mrcaott54737ott442049')).toBe('');
    expect(cleanOttLabel('Felidae')).toBe('Felidae');
    expect(ottIdFromLabel('ott42307')).toBe(42307);
    expect(ottIdFromLabel('Puma_concolor_ott42307')).toBe(42307);
    expect(ottIdFromLabel('mrcaott54737ott442049')).toBeNull();
  });
});

describe('deep trees', () => {
  it('handles a 20k-tip caterpillar without recursion', () => {
    const tree = caterpillar(20_000);
    const text = writeNewick(tree);
    const parsed = parseNewick(text);
    expect(treeStats(parsed).tips).toBe(20_000);
    const grafen = grafenBranchLengths(parsed);
    const stats = treeStats(grafen);
    expect(stats.isUltrametric).toBe(true);
    expect(stats.internalNodes).toBe(19_999);
    const keep = new Set(Array.from({ length: 10_000 }, (_, i) => `t${i * 2}`));
    const pruned = pruneToTips(parsed, keep);
    expect(treeStats(pruned)).toMatchObject({ tips: 10_000, internalNodes: 9_999 });
    const relabeled = relabelTips(parsed, (label) => label.toUpperCase());
    expect(relabeled.kept).toBe(20_000);
  });
});
