// GBIF raster map tiles for a quick preview map, in EPSG:4326 (plate carrée).
//
// Tiling: tiles are 512 px squares. At zoom z there are 2^(z+1) columns by 2^z rows,
// each 180 / 2^z degrees wide; x runs west to east from lon -180, y runs north to
// south from lat 90. Zoom 0 is two tiles: x = 0 (west hemisphere), x = 1 (east).
//
// Two occurrence endpoints (both CORS `*`, empty tiles answer 204 No Content):
// - `density`: precomputed and fast. Honours one taxonKey, one country, repeated
//   basisOfRecord and a closed year range; always leaves out records with geospatial
//   issues; silently ignores other parameters. Several taxonKey or country values, or
//   an open year bound ("1990,*"), answer 503.
// - `adhoc`: rendered from the occurrence search index, so it also honours several
//   taxa/countries, a WKT geometry, depth, uncertainty, hasGeospatialIssue and
//   occurrenceStatus. Slower (0.2-2 s per tile), so it is used only when needed.

import type { BBox, OccurrenceQuery } from '../types';
import { ALL_BASIS_OF_RECORD } from './predicate';
import { areaToWkt } from '../geo';

export const GBIF_TILE_SIZE = 512;

const MAP_API = 'https://api.gbif.org/v2/map/occurrence';
const BASEMAP_API = 'https://tile.gbif.org/4326/omt';

/** Density styles checked against the gbif-light and gbif-dark basemaps. */
export const GBIF_DENSITY_STYLES = {
  light: 'purpleYellow.point',
  dark: 'orangeHeat.point',
  /** For `bin: 'hex'`; the `.point` styles render hexagons too faintly. */
  lightHex: 'purpleYellow-noborder.poly',
  darkHex: 'classic-noborder.poly',
} as const;

export type GbifTileMode = 'density' | 'adhoc';

export interface TileCoord {
  z: number;
  x: number;
  y: number;
  /** Pixel ratio: 2 for high-DPI screens (1024 px images). Default 1. */
  scale?: 1 | 2;
}

export interface DensityTileOptions extends TileCoord {
  /** Explicit GBIF style; defaults to `GBIF_DENSITY_STYLES` for `dark` and `bin`. */
  style?: string;
  dark?: boolean;
  /** Draw raw points (default) or hexagon bins. */
  bin?: 'point' | 'hex';
  /** Hexagons across one tile when `bin` is 'hex' (default 64). */
  hexPerTile?: number;
  /** Endpoint; 'auto' (default) picks `gbifTileMode(query)`. */
  mode?: GbifTileMode | 'auto';
}

/** Number of columns and rows, and the tile size in degrees, at zoom z. */
export function gbifTileGrid(z: number): { cols: number; rows: number; degrees: number } {
  return { cols: 2 ** (z + 1), rows: 2 ** z, degrees: 180 / 2 ** z };
}

/** Lon/lat extent of tile (z, x, y). */
export function gbifTileBounds({ z, x, y }: TileCoord): BBox {
  const { degrees } = gbifTileGrid(z);
  const west = -180 + x * degrees;
  const north = 90 - y * degrees;
  return [west, north - degrees, west + degrees, north];
}

const taxonKeys = (query: OccurrenceQuery) =>
  query.taxa.map((t) => t.gbifKey).filter((k): k is number => k != null);

const countryCodes = (query: OccurrenceQuery) =>
  query.area.kind === 'countries' ? query.area.codes : [];

/** The endpoint that can show the query's taxa and area: density unless that cannot. */
export function gbifTileMode(query: OccurrenceQuery): GbifTileMode {
  return taxonKeys(query).length > 1 || countryCodes(query).length > 1 || areaToWkt(query.area)
    ? 'adhoc'
    : 'density';
}

interface TileParams {
  params: [string, string][];
  applied: string[];
  ignored: string[];
}

const rangeParam = ([lo, hi]: [number | null, number | null], open: [string, string]) =>
  `${lo ?? open[0]},${hi ?? open[1]}`;

/** Query parameters for one endpoint, plus which filters they honour. */
function tileParams(query: OccurrenceQuery, mode: GbifTileMode): TileParams {
  const params: [string, string][] = [];
  const applied: string[] = [];
  const ignored: string[] = [];
  const adhoc = mode === 'adhoc';
  const note = (honoured: boolean, label: string) => (honoured ? applied : ignored).push(label);

  const keys = taxonKeys(query);
  if (keys.length > 0) {
    const shown = adhoc ? keys : keys.slice(0, 1);
    for (const key of shown) {
      params.push(['taxonKey', String(key)]);
    }
    note(true, keys.length > 1 ? 'Taxa' : 'Taxon');
    if (shown.length < keys.length) {
      ignored.push('Taxa after the first');
    }
  }

  const area = query.area;
  if (area.kind === 'countries' && area.codes.length > 0) {
    const shown = adhoc ? area.codes : area.codes.slice(0, 1);
    for (const code of shown) {
      params.push(['country', code]);
    }
    note(true, area.codes.length > 1 ? 'Countries' : 'Country');
    if (shown.length < area.codes.length) {
      ignored.push('Countries after the first');
    }
  } else {
    const wkt = areaToWkt(area);
    if (wkt) {
      if (adhoc) {
        params.push(['geometry', wkt]);
      }
      note(adhoc, 'Area');
    }
  }

  const [from, to] = query.years;
  if (from != null || to != null) {
    // Density needs a closed range; years 1 and 9999 bound every GBIF record with a year.
    params.push(['year', rangeParam(query.years, adhoc ? ['*', '*'] : ['1', '9999'])]);
    note(true, 'Years');
  }

  const { quality } = query;
  const basis = quality.basisOfRecord;
  if (basis.length > 0 && !ALL_BASIS_OF_RECORD.every((b) => basis.includes(b))) {
    for (const b of basis) {
      params.push(['basisOfRecord', b]);
    }
    note(true, 'Basis of record');
  }

  if (query.depth[0] != null || query.depth[1] != null) {
    if (adhoc) {
      params.push(['depth', rangeParam(query.depth, ['*', '*'])]);
    }
    note(adhoc, 'Depth');
  }

  if (quality.maxUncertaintyMeters != null) {
    // "or missing" cannot be expressed as a search parameter.
    const honoured = adhoc && !quality.keepMissingUncertainty;
    if (honoured) {
      params.push(['coordinateUncertaintyInMeters', `0,${quality.maxUncertaintyMeters}`]);
    }
    note(honoured, 'Coordinate uncertainty');
  }

  if (quality.excludeGeospatialIssues) {
    if (adhoc) {
      params.push(['hasGeospatialIssue', 'false']);
    }
    // Density tiles never include records with geospatial issues.
    note(true, 'Geospatial issues');
  }

  if (quality.excludeIntroduced) {
    note(false, 'Introduced records');
  }

  if (quality.presentOnly) {
    if (adhoc) {
      params.push(['occurrenceStatus', 'PRESENT']);
    }
    note(adhoc, 'Absence records');
  }

  return { params, applied, ignored };
}

/** Human-readable filters that the preview tiles honour and ignore for this query. */
export function gbifTileFilterCoverage(
  query: OccurrenceQuery,
  mode: GbifTileMode | 'auto' = 'auto',
): { mode: GbifTileMode; applied: string[]; ignored: string[] } {
  const resolved = mode === 'auto' ? gbifTileMode(query) : mode;
  const { applied, ignored } = tileParams(query, resolved);
  return { mode: resolved, applied, ignored };
}

/** URL of one occurrence tile (PNG) for the query, ready for a raster tile layer. */
export function gbifDensityTileUrl(query: OccurrenceQuery, options: DensityTileOptions): string {
  const { z, x, y, scale = 1, dark = false, bin = 'point', hexPerTile = 64 } = options;
  const mode = !options.mode || options.mode === 'auto' ? gbifTileMode(query) : options.mode;
  const style =
    options.style ??
    (bin === 'hex'
      ? dark
        ? GBIF_DENSITY_STYLES.darkHex
        : GBIF_DENSITY_STYLES.lightHex
      : dark
        ? GBIF_DENSITY_STYLES.dark
        : GBIF_DENSITY_STYLES.light);

  const search = new URLSearchParams({ srs: 'EPSG:4326', style });
  if (bin === 'hex') {
    search.set('bin', 'hex');
    search.set('hexPerTile', String(hexPerTile));
  }
  for (const [key, value] of tileParams(query, mode).params) {
    search.append(key, value);
  }
  return `${MAP_API}/${mode}/${z}/${x}/${y}@${scale}x.png?${search}`;
}

/** GBIF OpenMapTiles basemap tile in EPSG:4326 (`gbif-light` or `gbif-dark`). */
export function gbifBasemapUrl({
  z,
  x,
  y,
  scale = 1,
  dark = false,
}: TileCoord & { dark?: boolean }): string {
  return `${BASEMAP_API}/${z}/${x}/${y}@${scale}x.png?style=${dark ? 'gbif-dark' : 'gbif-light'}`;
}
