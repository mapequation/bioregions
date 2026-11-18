// Runs every case in clean-cases.json through RecordCleaner, so the shared file stays
// true to the app. Format: docs/query-json.md#cleaning-cases.
import { describe, expect, it } from 'vitest';
import file from './clean-cases.json';
import { RecordCleaner } from './clean';
import type { AreaFilter, DedupeMode, Funnel, OccurrenceRecord, RecordSource } from './types';

interface CleanCase {
  id: string;
  description: string;
  area: AreaFilter;
  quality: { dedupe: DedupeMode };
  lowCount?: Partial<Record<RecordSource, string[]>>;
  /** `lon`/`lat` null stands for a missing coordinate. */
  records: { name: string; lon: number | null; lat: number | null; source: RecordSource }[];
  expected: { accepted: OccurrenceRecord[]; funnel: Funnel };
}

const cases = (file as { cases: unknown[] }).cases as CleanCase[];

describe('clean-cases.json', () => {
  it('covers every drop reason and dedupe mode', () => {
    const reasons = new Set(cases.flatMap((c) => Object.entries(c.expected.funnel.dropped).filter(([, n]) => n > 0).map(([r]) => r)));
    expect([...reasons].sort()).toEqual(Object.keys(cases[0].expected.funnel.dropped).sort());
    expect(new Set(cases.map((c) => c.quality.dedupe))).toEqual(new Set(['none', 'exact', 'cell']));
  });

  it.each(cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    const lowCount = Object.fromEntries(Object.entries(c.lowCount ?? {}).map(([s, names]) => [s, new Set(names)]));
    const cleaner = new RecordCleaner({ dedupe: c.quality.dedupe, area: c.area, lowCount });
    const records = c.records.map((r) => ({ ...r, lon: r.lon ?? Number.NaN, lat: r.lat ?? Number.NaN }));
    // One record per batch, as the stream may split batches anywhere.
    const accepted = records.flatMap((r) => cleaner.accept([r]));
    expect(accepted).toEqual(c.expected.accepted);
    expect(cleaner.funnel).toEqual(c.expected.funnel);
    // Batched as the streams deliver them (each batch from one source): same result.
    const runs: (typeof records)[] = [];
    for (const r of records) {
      const last = runs[runs.length - 1];
      if (last && last[0].source === r.source) last.push(r);
      else runs.push([r]);
    }
    const batched = new RecordCleaner({ dedupe: c.quality.dedupe, area: c.area, lowCount });
    expect(runs.flatMap((b) => batched.accept(b))).toEqual(c.expected.accepted);
    expect(batched.funnel).toEqual(c.expected.funnel);
  });
});
