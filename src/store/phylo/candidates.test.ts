import { describe, expect, it } from 'vitest';
import type { StudyTree } from '@/phylo/otol';
import type { TreeCandidate } from '../explorer/types';
import {
  arrangeRows,
  bestDatedCandidate,
  branchLengthKind,
  cleanTreeLabel,
  humanizeTreeLabel,
  initialOrder,
  lengthUnits,
  mapLimit,
  shortAuthors,
  sortCandidates,
  studyCandidate,
  studyCandidates,
  synthVersionLabel,
  syntheticCandidate,
  treeCitationText,
  truncateWords,
} from './candidates';

const study = (studyId: string, treeId: string, extra: Partial<StudyTree> = {}): StudyTree => ({
  studyId,
  treeId,
  reference: 'Johnson, W. E., Eizirik, E., & Pecon-Slattery, J. (2006). The late Miocene radiation of modern Felidae.',
  isDated: false,
  ...extra,
});

describe('candidates', () => {
  it('labels authors and versions', () => {
    expect(shortAuthors('Nyakatura, K., & Bininda-Emonds, O. R. (2012). Updating the evolutionary history')).toBe(
      'Nyakatura & Bininda-Emonds',
    );
    expect(shortAuthors(study('a', 'b').reference)).toBe('Johnson et al.');
    expect(shortAuthors('Smith JA, 2010. A tree.')).toBe('Smith');
    expect(shortAuthors('Janet C. Buckner, Jessica W. Lynch, Jean P. Boubli. 2015. Synthesis.')).toBe('Buckner et al.');
    expect(shortAuthors('')).toBeNull();
    expect(synthVersionLabel('opentree15.1')).toBe('v15.1');
    expect(branchLengthKind('ot:time')).toBe('time');
    expect(branchLengthKind('ot:substitutionCount')).toBe('other');
    expect(branchLengthKind(undefined)).toBe('none');
  });

  it('builds deduplicated study rows', () => {
    const rows = studyCandidates([
      [study('ot_1', 'tree1', { isDated: true, branchLengthMode: 'ot:time', year: 2006 })],
      [study('ot_1', 'tree1'), study('ot_2', 'tree1'), study('ot_2', 'tree2', { label: 'ML' }), study('ot_2', 'tree3', { label: 'Untitled (tree3)' })],
    ]);
    expect(rows.map((r) => r.id)).toEqual(['ot_1@tree1', 'ot_2@tree1', 'ot_2@tree2', 'ot_2@tree3']);
    expect(rows[0]).toMatchObject({
      title: 'Johnson et al. 2006',
      subtitle: undefined,
      branchLengths: 'time',
      year: 2006,
      coverageState: 'pending',
    });
    expect(rows[1]).toMatchObject({ title: 'Johnson et al.', subtitle: 'tree 1 of 3', subtitleDetail: 'ot_2/tree1' });
    expect(rows[2]).toMatchObject({ subtitle: 'ML', subtitleDetail: 'ML · ot_2/tree2' });
    expect(rows[3].subtitle).toBe('tree 3 of 3');
  });

  it('cleans tree labels and names branch-length units', () => {
    expect(cleanTreeLabel('Untitled (tree6187)', 'tree6187')).toBeNull();
    expect(cleanTreeLabel('tree6187', 'tree6187')).toBeNull();
    expect(cleanTreeLabel('  Time-calibrated,  soft bounds (tree6185) ', 'tree6185')).toBe('Time-calibrated, soft bounds');
    expect(cleanTreeLabel(undefined, 'tree1')).toBeNull();
    expect(cleanTreeLabel('Buckner et al., 2015 Bayesian Concatenated', 'tree1', 'Buckner')).toBe('Bayesian Concatenated');
    expect(cleanTreeLabel('Aristide et al., 2015 Bayesian', 'tree1', 'Aristide')).toBe('Bayesian');
    const units = (branchLengths: TreeCandidate['branchLengths'], lengthMode?: string, timeUnit?: string) =>
      lengthUnits({ branchLengths, lengthMode, timeUnit }).short;
    expect(units('time')).toBe('Myr');
    expect(units('time', 'ot:time', 'Myr')).toBe('Myr');
    expect(units('other', 'ot:substitutionCount')).toBe('subst./site');
    expect(units('other', 'ot:changesCount')).toBe('changes');
    expect(units('other', 'ot:other')).toBe('unknown');
    expect(units('none')).toBe('Grafen');
  });

  it('sorts with the synthetic tree first and filters dated', () => {
    const c = (id: string, matched: number | null, year: number | null, time = false): TreeCandidate => ({
      ...syntheticCandidate(null),
      id,
      kind: 'study',
      year,
      branchLengths: time ? 'time' : 'other',
      coverage: matched === null ? null : { matched, total: 10 },
    });
    const synth = { ...syntheticCandidate(null), coverage: { matched: 5, total: 10 } };
    const list = [c('a', 3, 2020), c('b', 8, 2001, true), c('c', null, 2024), synth];
    expect(sortCandidates(list, 'coverage', false).map((x) => x.id)).toEqual(['synthetic', 'b', 'a', 'c']);
    expect(sortCandidates(list, 'year', false).map((x) => x.id)).toEqual(['synthetic', 'c', 'a', 'b']);
    expect(sortCandidates(list, 'coverage', true).map((x) => x.id)).toEqual(['b']);

    // Unchecked rows sort after checked ones, and trees with no overlap go to their own group.
    const zero = { ...c('z', 0, 2024), coverageState: 'ready' as const };
    const all = [...list, zero];
    expect(sortCandidates(all, 'coverage', false).map((x) => x.id)).toEqual(['synthetic', 'b', 'a', 'c', 'z']);
    expect(initialOrder(all)).toEqual(['synthetic', 'b', 'c', 'z', 'a']);
    expect(arrangeRows(all, 'coverage')).toEqual({ order: ['synthetic', 'b', 'a', 'c'], noOverlap: ['z'] });

    // A pinned row keeps its visible position through a re-sort.
    const pinned = arrangeRows(all, 'coverage', { id: 'a', previous: ['synthetic', 'b', 'c', 'z', 'a'], visible: () => true });
    expect(pinned.order).toEqual(['synthetic', 'b', 'c', 'a']);
    const first = arrangeRows(all, 'coverage', { id: 'c', previous: ['synthetic', 'c', 'b'], visible: () => true });
    expect(first.order).toEqual(['synthetic', 'c', 'b', 'a']);
  });

  it('picks the best dated tree above 60 % coverage', () => {
    const c = (id: string, matched: number, year: number, time = true): TreeCandidate => ({
      ...syntheticCandidate(null),
      id,
      kind: 'study',
      year,
      branchLengths: time ? 'time' : 'other',
      coverage: { matched, total: 48 },
      coverageState: 'ready',
    });
    const synth = { ...syntheticCandidate(null), coverage: { matched: 44, total: 48 }, coverageState: 'ready' as const };
    expect(bestDatedCandidate([synth, c('a', 31, 2019), c('b', 31, 2012), c('u', 40, 2020, false)], 48)?.id).toBe('a');
    expect(bestDatedCandidate([synth, c('a', 28, 2019)], 48)).toBeNull();
  });

  it('writes the citation text', () => {
    const text = treeCitationText({ kind: 'synthetic', citation: 'Hinchliff 2015.' }, 12, true);
    expect(text).toMatch(/12 dataset species/);
    expect(text).toMatch(/Grafen/);
    expect(text.endsWith('Hinchliff 2015.')).toBe(true);
  });

  it('mapLimit caps concurrency', async () => {
    let active = 0;
    let peak = 0;
    await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 1));
      active--;
    });
    expect(peak).toBe(3);
  });
});

describe('tree labels', () => {
  it('humanises file-like ids and cuts at word boundaries', () => {
    expect(humanizeTreeLabel('MamPhy_fullPosterior_BDvr_DNAonly_4098sp_topoFree_NDexp_MCC_v2_target')).toBe(
      'MCC tree · DNA-only · 4,098 spp.',
    );
    expect(humanizeTreeLabel('some_file_name')).toBe('some file name');
    expect(humanizeTreeLabel('Garli ML tree')).toBe('Garli ML tree');
    expect(truncateWords('Time-calibrated, autocorrelated rates, soft-bounded constraints')).toBe(
      'Time-calibrated, autocorrelated rates…',
    );
  });

  it('drops file prefixes and a word cut by the label cap', () => {
    const c = studyCandidate({
      studyId: 'ot_3043',
      treeId: 'tree2',
      label: 'File S3. Fully assembled phylogeny in Newick forma',
      reference: 'Del Risco, A. A. (2024). Bats.',
      year: 2024,
      isDated: true,
    });
    expect(c.subtitle).toBe('Fully assembled phylogeny in Newick…');
    expect(c.subtitleDetail).toContain('File S3. Fully assembled phylogeny in Newick forma');
  });
});
