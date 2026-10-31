import { describe, expect, it } from 'vitest';
import type { OccurrenceQuery, TaxonRef } from '../types';
import { gbifSource } from './index';

const query = (taxa: TaxonRef[]) => ({ taxa }) as OccurrenceQuery;

describe('gbifSource.supports', () => {
  it('needs at least one taxon with a GBIF key', () => {
    expect(gbifSource.supports(query([]))).toEqual({ ok: true });
    expect(
      gbifSource.supports(
        query([
          { name: 'A', rank: 'SPECIES', obisId: 1 },
          { name: 'B', rank: 'SPECIES', gbifKey: 2 },
        ]),
      ),
    ).toEqual({ ok: true });
    expect(gbifSource.supports(query([{ name: 'A', rank: 'SPECIES', obisId: 1 }]))).toEqual({
      ok: false,
      reason: 'None of the selected taxa exist in the GBIF backbone',
    });
  });

  it('exposes the GBIF adapter', () => {
    expect(gbifSource).toMatchObject({ id: 'gbif', label: 'GBIF' });
  });
});
