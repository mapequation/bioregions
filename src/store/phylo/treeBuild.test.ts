import { describe, expect, it } from 'vitest';
import { parseNewick, tipLabels, treeStats } from '@/phylo/newickTools';
import {
  buildDatasetTree,
  coverageOf,
  coverageOfTips,
  datasetNewick,
  placeBrokenTaxa,
  type TipJoin,
  tipDisplayName,
  tipToDataset,
} from './treeBuild';

const join: TipJoin = {
  ottToDataset: new Map([
    [1, 'Puma concolor'],
    [2, 'Puma yagouaroundi'],
    [3, 'Felis catus'],
    [4, 'Lynx lynx'],
  ]),
  nameToDataset: new Map([
    ['Puma concolor', 'Puma concolor'],
    ['Herpailurus yagouaroundi', 'Puma yagouaroundi'],
    ['Lynx pardinus', 'Lynx pardinus'],
  ]),
};
const dataset = ['Puma concolor', 'Puma yagouaroundi', 'Felis catus', 'Lynx lynx', 'Panthera leo'];

describe('tipToDataset', () => {
  it('joins by OTT id, cleaned name and original label', () => {
    expect(tipToDataset('ott1', join)).toBe('Puma concolor');
    expect(tipToDataset('2', join)).toBe('Puma yagouaroundi');
    expect(tipToDataset('Herpailurus_yagouaroundi_ott999', join)).toBe('Puma yagouaroundi');
    expect(tipToDataset('*tip #1 not mapped to OTT. Original label - Lynx_pardinus', join)).toBe('Lynx pardinus');
    expect(tipToDataset('mrcaott1ott2', join)).toBeNull();
    expect(tipToDataset('ott42', join)).toBeNull();
  });
});

describe('buildDatasetTree', () => {
  it('prunes, relabels and places broken taxa at their MRCA (synthetic)', () => {
    const newick = '((ott1,ott2)mrcaott1ott2,(ott3,ott77)ott5)ott6;';
    const built = buildDatasetTree(newick, join, dataset, { ott4: 'ott5' });
    expect(tipLabels(built.tree).sort()).toEqual(['Felis catus', 'Lynx lynx', 'Puma concolor', 'Puma yagouaroundi']);
    expect(built.kept).toBe(4);
    expect(built.pruned).toBe(1);
    expect(built.broken).toEqual(['Lynx lynx']);
    expect(built.absentFromTree).toEqual(['Panthera leo']);
    expect(built.hasBranchLengths).toBe(false);
    expect(built.tree.name).toBe('');
    const { newick: out, grafen } = datasetNewick(built);
    expect(grafen).toBe(true);
    expect(out).toContain('Puma_concolor');
    const stats = treeStats(parseNewick(out));
    expect(stats.isUltrametric).toBe(true);
    expect(stats.tips).toBe(4);
  });

  it('keeps branch lengths of study trees and drops repeats', () => {
    const built = buildDatasetTree('((1:1,2:1):1,(3:1.5,1:2):0.5);', join, dataset);
    expect(built.kept).toBe(3);
    expect(built.pruned).toBe(1);
    expect(built.hasBranchLengths).toBe(true);
    expect(datasetNewick(built).grafen).toBe(false);
  });

  it('refuses trees with fewer than two dataset species', () => {
    expect(() => datasetNewick(buildDatasetTree('(1,99);', join, dataset))).toThrow(/two/);
  });
});

it('placeBrokenTaxa adds tips under the standing-in node', () => {
  const tree = placeBrokenTaxa(parseNewick('(ott1,mrcaott3ott4);'), { ott3: 'mrcaott3ott4', ott4: 'mrcaott3ott4' });
  expect(tipLabels(tree)).toEqual(['ott1', 'ott3', 'ott4']);
});

it('coverageOf counts distinct dataset species', () => {
  expect(coverageOf('((1:1,1:1):1,(3:1,9:1):1);', join)).toEqual({ matched: 2, hasBranchLengths: true, tips: 4 });
});

describe('tips not in the data', () => {
  it('counts coverage from tips and lists the rest by name', () => {
    const tips = { labels: ['1', '1', '9', '3'], names: ['Puma concolor', 'Puma concolor', 'Homo sapiens', 'Felis catus'], hasBranchLengths: true };
    expect(coverageOfTips(tips, join)).toEqual({
      kept: new Set(['Puma concolor', 'Felis catus']),
      hasBranchLengths: true,
      notInData: ['Puma concolor', 'Homo sapiens'],
    });
  });

  it('keeps the labels of dropped source tips', () => {
    const built = buildDatasetTree('((1:1,9:1):1,3:2);', join, ['Puma concolor', 'Felis catus']);
    expect(built.notInData).toEqual(['9']);
    expect(tipDisplayName('9')).toBe('ott9');
    expect(tipDisplayName("*tip #1 not mapped to OTT. Original label - Saguinus_sp.")).toBe('Saguinus sp.');
  });
});
