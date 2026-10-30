// Gridded record counts for a preview map, from OBIS geohash aggregation.

import type { FeatureCollection, Polygon } from 'geojson';
import { fetchJson } from '../http';
import type { OccurrenceQuery } from '../types';
import { obisParams } from './params';
import { obisUrl } from './preview';
import { resolveQueryTaxa } from './taxa';

/**
 * Geohash precision -> cell size: 1 = 45° x 45°, 2 = 11.25° x 5.625°,
 * 3 = 1.40625° x 1.40625° (use 3 for ~1-5° cells; ~200 kB for an ocean basin),
 * 4 = 0.35° x 0.18°.
 */
export const OBIS_GRID_PRECISION = 3;

export type ObisGrid = FeatureCollection<Polygon, { n: number }>;

/** Record counts per geohash cell (`properties.n`) for the server-side query. */
export async function obisGrid(
  query: OccurrenceQuery,
  precision: number = OBIS_GRID_PRECISION,
  signal?: AbortSignal,
): Promise<ObisGrid> {
  const taxa = await resolveQueryTaxa(query, signal);
  if (taxa.empty) {
    return { type: 'FeatureCollection', features: [] };
  }
  const params = obisParams(query, { taxonIds: taxa.ids });
  return fetchJson<ObisGrid>(obisUrl(`occurrence/grid/${Math.round(precision)}`, params), {
    signal,
  });
}
