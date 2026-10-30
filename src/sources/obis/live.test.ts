// Live smoke test against api.obis.org; run with LIVE_API=1.
import { describe, expect, it } from 'vitest';
import type { OccurrenceQuery } from '../types';
import { obisSource } from './index';

const query: OccurrenceQuery = {
  taxa: [{ name: 'Delphinidae', rank: 'FAMILY' }],
  area: { kind: 'bbox', bbox: [-40, 50, -20, 65] },
  years: [2000, 2020],
  depth: [null, null],
  quality: {
    basisOfRecord: [],
    maxUncertaintyMeters: null,
    keepMissingUncertainty: true,
    excludeGeospatialIssues: false,
    excludeIntroduced: false,
    presentOnly: true,
    dedupe: 'none',
  },
  sources: { gbif: false, obis: true },
};

describe('OBIS live', () => {
  it.skipIf(!process.env.LIVE_API)(
    'suggests, previews, plans and streams Delphinidae in the North Atlantic',
    async () => {
      const taxa = await obisSource.suggestTaxa('Delphinidae');
      expect(taxa[0]).toMatchObject({ name: 'Delphinidae', obisId: 136980 });
      const preview = await obisSource.preview(query);
      expect(preview.total).toBeGreaterThan(100);
      expect(preview.topSpecies.length).toBeGreaterThan(0);
      const plan = await obisSource.plan(query);
      let fetched = 0;
      for await (const batch of obisSource.stream(plan, { maxRecords: 300 })) {
        fetched = batch.progress.fetched;
      }
      expect(fetched).toBe(Math.min(300, plan.expectedRecords));
    },
    60_000,
  );
});
