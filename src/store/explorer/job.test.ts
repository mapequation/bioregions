import { describe, expect, it } from 'vitest';
import { RecordCleaner } from '../../sources/clean';
import type { OccurrenceRecord, RecordBatch, SourceId } from '../../sources/types';
import { LoadTally, SeededDedupe, etaSeconds, mergeBatches } from './job';

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
});

describe('etaSeconds', () => {
  it('extrapolates the average rate', () => {
    expect(etaSeconds(100, 300, 10_000)).toBe(20);
    expect(etaSeconds(0, 300, 10_000)).toBeNull();
    expect(etaSeconds(10, 300, 500)).toBeNull();
  });
});
