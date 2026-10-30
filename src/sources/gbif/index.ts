// The GBIF adapter behind the source-agnostic `DataSource` contract.

import type { DataSource, OccurrenceQuery, Supports } from '../types';
import { previewGbif } from './preview';
import { planGbif, streamGbif } from './stream';
import { suggestGbifTaxa } from './taxa';

/** GBIF can run the query unless every selected taxon lacks a backbone key. */
export function supportsGbif(query: OccurrenceQuery): Supports {
  if (query.taxa.length > 0 && query.taxa.every((t) => t.gbifKey == null)) {
    return { ok: false, reason: 'None of the selected taxa exist in the GBIF backbone' };
  }
  return { ok: true };
}

export const gbifSource: DataSource = {
  id: 'gbif',
  label: 'GBIF',
  supports: supportsGbif,
  preview: previewGbif,
  plan: (query, signal) => planGbif(query, { maxRecords: Number.POSITIVE_INFINITY }, signal),
  stream: streamGbif,
  suggestTaxa: suggestGbifTaxa,
};
