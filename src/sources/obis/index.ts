// OBIS (Ocean Biodiversity Information System) as a DataSource.

import type { DataSource } from '../types';
import { supportsObis } from './params';
import { previewObis } from './preview';
import { planObis, streamObis } from './stream';
import { suggestObisTaxa } from './taxa';

export const obisSource: DataSource = {
  id: 'obis',
  label: 'OBIS',
  supports: supportsObis,
  preview: previewObis,
  plan: (query, signal) => planObis(query, {}, signal),
  stream: streamObis,
  suggestTaxa: suggestObisTaxa,
};

export { obisCaveats, obisParams, supportsObis } from './params';
export { obisGrid, OBIS_GRID_PRECISION } from './grid';
export { planObis, streamObis } from './stream';
export { previewObis } from './preview';
export { resolveObisTaxon, resolveQueryTaxa, suggestObisTaxa } from './taxa';
