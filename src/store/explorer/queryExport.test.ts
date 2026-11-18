import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gbifDownloadPredicate } from '../../sources/gbif/predicate';
import { obisParams } from '../../sources/obis/params';
import { decodeQuery, defaultQuery, encodeQuery } from '../../sources/query';
import type { OccurrenceQuery } from '../../sources/types';
import { parseQueryText } from './library';
import { buildQueryExport, loadRequests, obisParamsObject, queryRequests } from './queryExport';

const FIXTURE = new URL('./query.example.json', import.meta.url);

/** The query behind `query.example.json`: dolphins in the North Atlantic from both sources. */
const dolphins = (): OccurrenceQuery => ({
  ...defaultQuery(),
  taxa: [{ name: 'Delphinidae', rank: 'FAMILY', gbifKey: 5406, obisId: 136980 }],
  area: { kind: 'bbox', bbox: [-80, 20, 0, 66], label: 'North Atlantic' },
  years: [1990, 2024],
  sources: { gbif: true, obis: true },
});

const exportOf = (q: OccurrenceQuery) =>
  buildQueryExport(q, {
    version: '2.0.0-alpha.22',
    download: { key: '0012345-240000000000000', doi: '10.15468/dl.abcd12' },
  });

describe('query.json export', () => {
  it('matches the committed example (QUERY_FIXTURE=write regenerates it)', () => {
    const json = `${JSON.stringify(exportOf(dolphins()), null, 2)}\n`;
    if (process.env.QUERY_FIXTURE === 'write') writeFileSync(FIXTURE, json);
    expect(json).toBe(readFileSync(FIXTURE, 'utf8'));
  });

  it('adds the requests, the download and the app next to the unchanged query fields', () => {
    const q = dolphins();
    const out = exportOf(q);
    expect(out.requests.gbif).toEqual(gbifDownloadPredicate(q));
    expect(out.requests.obis).toEqual({
      taxonid: '136980',
      geometry: 'POLYGON((-80 20,0 20,0 66,-80 66,-80 20))',
      startdate: '1990-01-01',
      enddate: '2024-12-31',
      absence: 'false',
      exclude: 'ON_LAND,DEPTH_EXCEEDS_BATH',
    });
    expect(out.gbifDownload).toEqual({ key: '0012345-240000000000000', doi: '10.15468/dl.abcd12' });
    expect(out.app).toEqual({ name: 'infomap-bioregions', version: '2.0.0-alpha.22' });
    const { requests: _r, gbifDownload: _d, app: _a, ...rest } = out;
    expect(rest).toEqual(q);
  });

  it('imports to the same query through the app parser', () => {
    // Compare against the query after its own round trip, so known parser gaps (fields
    // `parseQuality` does not read yet) don't decide this test.
    const q = dolphins();
    const viaShare = decodeQuery(encodeQuery(q));
    const parsed = parseQueryText(readFileSync(FIXTURE, 'utf8'));
    expect(parsed.ok && parsed.query).toEqual(viaShare);
    expect(parseQueryText(JSON.stringify(exportOf(q))).ok).toBe(true);
  });

  it('omits OBIS while a taxon has no AphiaID, and sources that are off', () => {
    const q = dolphins();
    q.taxa = [{ name: 'Delphinidae', rank: 'FAMILY', gbifKey: 5406 }];
    expect(Object.keys(queryRequests(q))).toEqual(['gbif']);
    q.sources = { gbif: false, obis: true };
    q.taxa[0].obisId = 136980;
    expect(Object.keys(queryRequests(q))).toEqual(['obis']);
    expect(buildQueryExport(q, { version: 'x' }).gbifDownload).toBeUndefined();
  });

  it('uses the recorded requests of a load, with OBIS params as a flat object', () => {
    const q = dolphins();
    const sent = `${obisParams(q).toString()}&size=5000&after=abc`;
    const out = buildQueryExport(q, { requests: { gbif: { type: 'and', predicates: [] }, obis: sent }, version: 'x' });
    expect(out.requests.gbif).toEqual({ type: 'and', predicates: [] });
    expect(out.requests.obis).toEqual(obisParamsObject(obisParams(q)));
    expect(out.requests.obis).not.toHaveProperty('size');
    expect(loadRequests({ obis: { taxonid: 1 } })).toEqual({ obis: { taxonid: '1' } });
  });
});
