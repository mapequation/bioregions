import { describe, expect, it } from 'vitest';
import { RecordCleaner } from '../../sources/clean';
import type { OccurrenceRecord, RecordBatch, SourceId } from '../../sources/types';
import { LoadTally, PauseGate, SeededDedupe, etaSeconds, mergeBatches, mergeFunnels } from './job';

const rec = (name: string, lon: number, lat: number, source: SourceId = 'gbif', extra: Partial<OccurrenceRecord> = {}) => ({
  name,
  lon,
  lat,
  source,
  ...extra,
});

const batch = (source: SourceId, n: number): RecordBatch => ({
  source,
  records: Array.from({ length: n }, (_, i) => rec('Aa bb', i, i, source)),
  progress: { fetched: n, expected: n, requestsDone: 1, requestsTotal: 1 },
});

async function* gen(batches: RecordBatch[], fail?: Error) {
  for (const b of batches) {
    await Promise.resolve();
    yield b;
  }
  if (fail) throw fail;
}

describe('mergeBatches', () => {
  it('interleaves streams and keeps going when one fails', async () => {
    const errors: string[] = [];
    const done: string[] = [];
    const out: string[] = [];
    for await (const b of mergeBatches(
      [
        { source: 'gbif', stream: gen([batch('gbif', 1), batch('gbif', 2)]) },
        { source: 'obis', stream: gen([batch('obis', 3)], new Error('boom')) },
      ],
      (s, e) => errors.push(`${s}:${(e as Error).message}`),
      (s) => done.push(s),
    )) {
      out.push(`${b.source}${b.records.length}`);
    }
    expect(out.sort()).toEqual(['gbif1', 'gbif2', 'obis3']);
    expect(errors).toEqual(['obis:boom']);
    expect(done).toEqual(['gbif']);
  });

  it('does not report aborts as errors', async () => {
    const errors: unknown[] = [];
    const abort = new DOMException('Aborted', 'AbortError');
    for await (const _ of mergeBatches([{ source: 'gbif', stream: gen([], abort as unknown as Error) }], (_s, e) =>
      errors.push(e),
    )) {
      // no batches
    }
    expect(errors).toEqual([]);
  });
});

describe('SeededDedupe', () => {
  it('drops records that duplicate loaded points and adjusts the funnel', () => {
    const cleaner = new RecordCleaner({ dedupe: 'exact' });
    const seeded = new SeededDedupe('exact', [{ name: 'Aa bb', lon: 10, lat: 20 }]);
    const out = seeded.filter(cleaner.accept([rec('Aa bb', 10.00001, 20), rec('Aa bb', 11, 20), rec('Cc dd', 10, 20, 'obis')]));
    expect(out.map((r) => r.name)).toEqual(['Aa bb', 'Cc dd']);
    const f = seeded.adjust(cleaner.funnel);
    expect(f.accepted).toBe(2);
    expect(f.dropped.duplicate).toBe(1);
    expect(f.bySource.gbif?.accepted).toBe(1);
  });

  it('keeps everything without dedupe', () => {
    const seeded = new SeededDedupe('none', [{ name: 'Aa bb', lon: 10, lat: 20 }]);
    expect(seeded.filter([rec('Aa bb', 10, 20)])).toHaveLength(1);
  });
});

describe('mergeFunnels', () => {
  it('sums every count, drop reason and source', () => {
    const first = new RecordCleaner({ dedupe: 'exact' });
    first.accept([
      { name: 'Callithrix jacchus', lon: 1, lat: 1, source: 'gbif' },
      { name: 'Callithrix jacchus', lon: 1, lat: 1, source: 'gbif' },
      { name: '', lon: 2, lat: 2, source: 'gbif' },
    ]);
    const second = new RecordCleaner({ dedupe: 'exact' });
    second.accept([
      { name: 'Saguinus oedipus', lon: 3, lat: 3, source: 'obis' },
      { name: 'Saguinus midas', lon: 0, lat: 0, source: 'obis' },
    ]);
    const merged = mergeFunnels(first.funnel, second.funnel);
    expect(merged).toMatchObject({ received: 5, accepted: 2 });
    expect(merged.dropped).toMatchObject({ duplicate: 1, noSpecies: 1, zeroCoordinates: 1 });
    expect(merged.bySource).toEqual({ gbif: { received: 3, accepted: 1 }, obis: { received: 2, accepted: 1 } });
    // A run that received nothing leaves the funnel as it was.
    expect(mergeFunnels(first.funnel, new RecordCleaner({ dedupe: 'none' }).funnel)).toEqual(first.funnel);
  });
});

describe('RecordCleaner lowCount', () => {
  it('drops listed species for one source only', () => {
    const cleaner = new RecordCleaner({ dedupe: 'none', lowCount: { obis: new Set(['Aa bb']) } });
    const out = cleaner.accept([rec('Aa bb', 1, 1, 'obis'), rec('Aa bb', 1, 1, 'gbif'), rec('Aa bb ssp. c', 2, 2, 'obis')]);
    expect(out).toHaveLength(1);
    expect(cleaner.funnel.dropped.lowCount).toBe(2);
  });
});

describe('LoadTally', () => {
  it('counts datasets, species and years per source', () => {
    const t = new LoadTally();
    t.add('gbif', [rec('Aa bb', 1, 1, 'gbif', { datasetKey: 'd1', year: 1990 }), rec('Cc dd', 1, 1, 'gbif', { datasetKey: 'd1', year: 2001 })]);
    t.add('obis', [rec('Aa bb', 1, 1, 'obis', { datasetKey: 'o1' })]);
    expect(t.datasetCounts(new Map([['d1', 'Dataset one']]))).toEqual({
      gbif: [{ key: 'd1', label: 'Dataset one', count: 2 }],
      obis: [{ key: 'o1', label: 'o1', count: 1 }],
    });
    expect(t.species.size).toBe(2);
    expect(t.yearRange).toEqual([1990, 2001]);
    expect(t.datasetTotal).toBe(2);
    expect(t.bySource).toEqual({ gbif: 2, obis: 1 });
  });

  it('snapshots the statistics of the accepted records', () => {
    const t = new LoadTally();
    t.add('gbif', [
      rec('Aa bb', 1, 1, 'gbif', { datasetKey: 'd1', year: 1990, basisOfRecord: 'HUMAN_OBSERVATION', country: 'BR', uncertainty: 10 }),
      rec('Aa bb', 2, 1, 'gbif', { datasetKey: 'd1', year: 1990, basisOfRecord: 'PRESERVED_SPECIMEN', country: 'BR', uncertainty: 30 }),
      rec('Cc dd', 3, 1, 'gbif', { datasetKey: 'd2', year: 2001, basisOfRecord: 'HUMAN_OBSERVATION', country: 'PE' }),
    ]);
    t.add('obis', [rec('Cc dd', 4, 1, 'obis', { datasetKey: 'o1', basisOfRecord: 'HUMAN_OBSERVATION' })]);
    const s = t.stats({ datasets: new Map([['d1', 'Dataset one']]), countries: new Map([['BR', 'Brasil']]) });
    expect(s.total).toBe(4);
    expect(s.basisOfRecord).toEqual([
      { key: 'HUMAN_OBSERVATION', label: 'Human observation', count: 3 },
      { key: 'PRESERVED_SPECIMEN', label: 'Preserved specimen', count: 1 },
    ]);
    expect(s.datasets[0]).toEqual({ key: 'd1', label: 'Dataset one', count: 2, source: 'gbif' });
    expect(s.datasets.map((d) => d.source)).toEqual(['gbif', 'gbif', 'obis']);
    expect(s.years).toEqual([
      { year: 1990, count: 2 },
      { year: 2001, count: 1 },
    ]);
    expect(s.species).toEqual([
      { key: 'Aa bb', label: 'Aa bb', count: 2 },
      { key: 'Cc dd', label: 'Cc dd', count: 2 },
    ]);
    // Labels from the preview facets win; other codes get their English name.
    expect(s.countries).toEqual([
      { key: 'BR', label: 'Brasil', count: 2 },
      { key: 'PE', label: 'Peru', count: 1 },
    ]);
    expect(s.withCountry).toEqual({ gbif: 3 });
    expect(s.uncertainty).toEqual({ min: 10, max: 30, avg: 20 });
  });
});

describe('PauseGate', () => {
  it('holds waiters while closed and releases them on open', async () => {
    const gate = new PauseGate();
    expect(gate.wait()).toBeNull();
    gate.close();
    expect(gate.paused).toBe(true);
    let passed = false;
    void gate.wait()?.then(() => {
      passed = true;
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(passed).toBe(false);
    gate.open();
    await new Promise((r) => setTimeout(r, 0));
    expect(passed).toBe(true);
    expect(gate.paused).toBe(false);
  });
});

describe('etaSeconds', () => {
  it('extrapolates the average rate', () => {
    expect(etaSeconds(100, 300, 10_000)).toBe(20);
    expect(etaSeconds(0, 300, 10_000)).toBeNull();
    expect(etaSeconds(10, 300, 500)).toBeNull();
  });
});
