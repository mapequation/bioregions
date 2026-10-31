// Public surface of the occurrence data layer: the source registry plus the
// source-agnostic helpers (query presets, regions, cleaning, citations) the
// UI and stores build on. Source-specific extras are re-exported by name.

import { gbifSource } from './gbif';
import { obisSource } from './obis';
import type { DataSource, SourceId } from './types';

/** Every occurrence source the app can query, keyed by id. */
export const SOURCES: Record<SourceId, DataSource> = {
  gbif: gbifSource,
  obis: obisSource,
};

/** Sources in display order. */
export const SOURCE_LIST: DataSource[] = [gbifSource, obisSource];

export type * from './types';
export * from './query';
export * from './regions';
export * from './clean';
export * from './methods';
export { WORLD_BBOX, areaToWkt, bboxContains, bboxToWkt } from './geo';
export { HttpError, isAbortError } from './http';

// GBIF extras: map tiles, the async download flow and zip import.
export { gbifSource, supportsGbif } from './gbif';
export { activeGbifFilters, issueLabel } from './gbif/preview';
export { gbifTaxonCount, resolveGbifTaxon } from './gbif/taxa';
export {
  gbifBasemapUrl,
  gbifDensityTileUrl,
  gbifTileFilterCoverage,
  gbifTileMode,
  GBIF_TILE_SIZE,
} from './gbif/tiles';
export {
  gbifDownloadCitation,
  GbifDownloadError,
  getGbifDownload,
  pollGbifDownload,
  requestGbifDownload,
  TERMINAL_DOWNLOAD_STATES,
} from './gbif/download';
export type { GbifDownloadStatus } from './gbif/download';
export { importGbifZip } from './gbif/zip';
export type { GbifZipSummary } from './gbif/zip';

// OBIS extras: caveats for the query panel and the gridded density layer.
export { obisSource, obisCaveats, obisGrid, OBIS_GRID_PRECISION, supportsObis } from './obis';
