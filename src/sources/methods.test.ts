import { describe, expect, it } from 'vitest';
import { derivedDatasetCsv, gbifCitation, methodsParagraph, obisCitation } from './methods';
import { defaultQuery } from './query';
import type { OccurrenceQuery, ProvenanceEntry } from './types';

const query: OccurrenceQuery = {
  ...defaultQuery(),
  taxa: [{ name: 'Felidae', rank: 'FAMILY', gbifKey: 9703 }],
  area: { kind: 'bbox', bbox: [-82, -56, -34, 13] },
  years: [1970, 2025],
  sources: { gbif: true, obis: true },
};

const gbif: ProvenanceEntry = {
  id: 'g1',
  source: 'gbif',
  label: 'GBIF occurrence API',
  retrievedAt: '2026-10-30T12:00:00Z',
  query,
  fetched: 1200,
  accepted: 1000,
  datasets: [
    { key: 'ds-b', count: 300 },
    { key: 'ds-a', count: 700 },
  ],
};
const obis: ProvenanceEntry = {
  ...gbif,
  id: 'o1',
  source: 'obis',
  label: 'OBIS API',
  fetched: 50,
  accepted: 40,
  datasets: [{ key: 'ds-a', count: 40 }],
};

describe('citations', () => {
  it('formats GBIF with and without a DOI', () => {
    expect(gbifCitation(gbif)).toBe(
      'GBIF.org (30 October 2026) GBIF Occurrence Data via API, derived dataset to be registered',
    );
    expect(gbifCitation({ ...gbif, doi: 'doi:10.15468/dl.abc123' })).toBe(
      'GBIF.org (30 October 2026) GBIF Occurrence Download https://doi.org/10.15468/dl.abc123',
    );
    expect(obisCitation(obis)).toBe(
      'OBIS (2026) Ocean Biodiversity Information System. Intergovernmental Oceanographic Commission of UNESCO. https://obis.org',
    );
  });

  it('aggregates GBIF datasets into a derived-dataset CSV', () => {
    const second = { ...gbif, datasets: [{ key: 'ds-b', count: 500 }] };
    expect(derivedDatasetCsv([gbif, obis, second])).toBe('datasetKey,count\nds-b,800\nds-a,700');
    expect(derivedDatasetCsv([obis])).toBe('datasetKey,count');
  });
});

describe('methodsParagraph', () => {
  it('describes sources, filters, cleaning, counts, phylogeny and citations', () => {
    const text = methodsParagraph({
      entries: [gbif, obis],
      funnel: {
        received: 1250,
        accepted: 1040,
        dropped: { noSpecies: 100, invalidCoordinates: 0, zeroCoordinates: 10, outsideArea: 0, duplicate: 100, lowCount: 0 },
        bySource: {},
      },
      speciesCount: 40,
      phylogeny: { citation: 'Hinchliff et al. 2015', label: 'the Open Tree of Life synthetic tree', tips: 38, matched: 36, branchLengths: 'grafen' },
    });
    for (const part of [
      'Occurrence records of Felidae in South America recorded 1970–2025',
      'Global Biodiversity Information Facility (GBIF) (GBIF occurrence API, retrieved 30 October 2026)',
      'Ocean Biodiversity Information System (OBIS)',
      'coordinate uncertainty of at most 10 km',
      'not recorded as introduced',
      'rounded to four decimal places',
      'The final dataset has 1,040 records of 40 species (of 1,250 records received; removed: 100 without a species-level name, 10 at (0, 0), 100 duplicates).',
      "Grafen's (1989)",
      '36 of its 38 tips matched species in the occurrence data (90% of the species)',
      'Data citations: GBIF.org (30 October 2026) GBIF Occurrence Data via API, derived dataset to be registered; OBIS (2026)',
    ]) {
      expect(text).toContain(part);
    }
  });

  it('works without query or funnel and reports truncation', () => {
    const text = methodsParagraph({
      entries: [{ ...gbif, query: undefined, truncated: 5000, doi: '10.15468/dl.x' }],
      funnel: null,
      speciesCount: 3,
    });
    expect(text).toContain('Occurrence records were obtained from');
    expect(text).toContain('1,000 records of 3 species (of 1,200 records received)');
    expect(text).toContain('5,000 matching records were not downloaded');
    expect(text).toContain('https://doi.org/10.15468/dl.x');
  });

  it('states the species-level exclusion and the duplicate rule', () => {
    const exact = methodsParagraph({ entries: [gbif], funnel: null, speciesCount: 3, query });
    expect(exact).toContain('Only records identified to species were used');
    expect(exact).toContain('identified only to genus or a higher rank');
    expect(exact).toContain('Duplicate records of the same species at the same coordinates');
    const kept = methodsParagraph({
      entries: [gbif],
      funnel: null,
      speciesCount: 3,
      query: { ...query, quality: { ...query.quality, dedupe: 'none' } },
    });
    expect(kept).toContain('Duplicate records were kept.');
  });
});
