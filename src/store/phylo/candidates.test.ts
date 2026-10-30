import { describe, expect, it } from 'vitest';
import type { StudyTree } from '@/phylo/otol';
import type { TreeCandidate } from '../explorer/types';
import {
  branchLengthKind,
  mapLimit,
  shortAuthors,
  sortCandidates,
  studyCandidates,
  synthVersionLabel,
  syntheticCandidate,
  treeCitationText,
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
    expect(rows[0]).toMatchObject({ title: 'Johnson et al.', branchLengths: 'time', year: 2006, coverageState: 'pending' });
    expect(rows[2].title).toBe('Johnson et al. (ML)');
    expect(rows[3].title).toBe('Johnson et al. (tree3)');
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
