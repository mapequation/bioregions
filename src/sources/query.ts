// Source-agnostic query helpers: defaults, quality presets, summaries and URL encoding.
import { areaLabel, COUNTRY_CODES } from './regions';
import type {
  AreaFilter,
  BasisOfRecord,
  DedupeMode,
  OccurrenceQuery,
  QualityFilters,
  SourceId,
  Supports,
  TaxonRef,
} from './types';

export const ALL_BASIS: BasisOfRecord[] = [
  'PRESERVED_SPECIMEN',
  'HUMAN_OBSERVATION',
  'MACHINE_OBSERVATION',
  'OCCURRENCE',
  'MATERIAL_SAMPLE',
  'MATERIAL_CITATION',
  'OBSERVATION',
  'LIVING_SPECIMEN',
  'FOSSIL_SPECIMEN',
];

/** Wild, present-day records: everything except captive/cultivated and fossil specimens. */
export const DEFAULT_BASIS: BasisOfRecord[] = ALL_BASIS.filter(
  (b) => b !== 'LIVING_SPECIMEN' && b !== 'FOSSIL_SPECIMEN',
);

/** Short readable names for basis-of-record values. */
export const BASIS_LABELS: Record<BasisOfRecord, string> = {
  PRESERVED_SPECIMEN: 'Preserved specimen',
  HUMAN_OBSERVATION: 'Human observation',
  MACHINE_OBSERVATION: 'Machine observation',
  OCCURRENCE: 'Occurrence (unspecified)',
  MATERIAL_SAMPLE: 'Material sample',
  MATERIAL_CITATION: 'Material citation',
  OBSERVATION: 'Observation',
  LIVING_SPECIMEN: 'Living specimen',
  FOSSIL_SPECIMEN: 'Fossil specimen',
};

const DEDUPE_MODES: DedupeMode[] = ['none', 'exact', 'cell'];
const SOURCE_IDS: SourceId[] = ['gbif', 'obis'];

export type QualityPresetId = 'recommended' | 'strict' | 'permissive';

export interface QualityPreset {
  label: string;
  description: string;
  quality: QualityFilters;
}

export const QUALITY_PRESETS: Record<QualityPresetId, QualityPreset> = {
  recommended: {
    label: 'Recommended',
    description:
      'Wild, present-day records located within 10 km, without flagged coordinate problems, introduced populations or recorded absences, one per species and site.',
    quality: {
      basisOfRecord: DEFAULT_BASIS,
      maxUncertaintyMeters: 10000,
      keepMissingUncertainty: true,
      excludeGeospatialIssues: true,
      excludeIntroduced: true,
      presentOnly: true,
      dedupe: 'exact',
    },
  },
  strict: {
    label: 'Strict',
    description:
      'Only vouchered specimens, observations and samples with a reported location within 5 km, native populations only, thinned to one record per species and ~1 km cell.',
    quality: {
      basisOfRecord: [
        'PRESERVED_SPECIMEN',
        'HUMAN_OBSERVATION',
        'MACHINE_OBSERVATION',
        'MATERIAL_SAMPLE',
        'OBSERVATION',
      ],
      maxUncertaintyMeters: 5000,
      keepMissingUncertainty: false,
      excludeGeospatialIssues: true,
      excludeIntroduced: true,
      presentOnly: true,
      dedupe: 'cell',
    },
  },
  permissive: {
    label: 'Permissive',
    description:
      'Every non-fossil presence record without flagged coordinate problems, including captive, cultivated and introduced populations and imprecise locations.',
    quality: {
      basisOfRecord: ALL_BASIS.filter((b) => b !== 'FOSSIL_SPECIMEN'),
      maxUncertaintyMeters: null,
      keepMissingUncertainty: true,
      excludeGeospatialIssues: true,
      excludeIntroduced: false,
      presentOnly: true,
      dedupe: 'none',
    },
  },
};

const sameSet = <T>(a: readonly T[], b: readonly T[]) => {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((x) => sb.has(x));
};

/** Normalized basis list: empty means all. */
const basisSet = (basis: readonly BasisOfRecord[]) => (basis.length === 0 ? ALL_BASIS : basis);

function sameQuality(a: QualityFilters, b: QualityFilters): boolean {
  return (
    sameSet(basisSet(a.basisOfRecord), basisSet(b.basisOfRecord)) &&
    a.maxUncertaintyMeters === b.maxUncertaintyMeters &&
    // Without an uncertainty limit, whether missing values are kept does not matter.
    (a.maxUncertaintyMeters === null || a.keepMissingUncertainty === b.keepMissingUncertainty) &&
    a.excludeGeospatialIssues === b.excludeGeospatialIssues &&
    a.excludeIntroduced === b.excludeIntroduced &&
    a.presentOnly === b.presentOnly &&
    a.dedupe === b.dedupe
  );
}

/** The preset these filters equal, or 'custom'. */
export function matchPreset(quality: QualityFilters): QualityPresetId | 'custom' {
  for (const id of Object.keys(QUALITY_PRESETS) as QualityPresetId[]) {
    if (sameQuality(quality, QUALITY_PRESETS[id].quality)) return id;
  }
  return 'custom';
}

/** A fresh copy of a preset's filters. */
export function presetQuality(id: QualityPresetId): QualityFilters {
  const q = QUALITY_PRESETS[id].quality;
  return { ...q, basisOfRecord: [...q.basisOfRecord] };
}

/** Empty query: no taxa, the whole world, all years and depths, recommended quality, GBIF only. */
export function defaultQuery(): OccurrenceQuery {
  return {
    taxa: [],
    area: { kind: 'world' },
    years: [null, null],
    depth: [null, null],
    quality: presetQuality('recommended'),
    sources: { gbif: true, obis: false },
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * Stable cache key: sorted-key JSON. Set-like lists (taxa, countries, basis of
 * record) are sorted so their order does not change the key.
 */
export function queryKey(query: OccurrenceQuery): string {
  const taxa = [...query.taxa].sort((a, b) => {
    const ka = `${a.rank}|${a.name}|${a.gbifKey ?? ''}|${a.obisId ?? ''}`;
    const kb = `${b.rank}|${b.name}|${b.gbifKey ?? ''}|${b.obisId ?? ''}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  const area: AreaFilter =
    query.area.kind === 'countries'
      ? { kind: 'countries', codes: [...query.area.codes].sort() }
      : query.area;
  const quality = { ...query.quality, basisOfRecord: [...query.quality.basisOfRecord].sort() };
  return stableStringify({ ...query, taxa, area, quality });
}

function formatMeters(m: number): string {
  return m >= 1000 ? `${Math.round(m / 100) / 10} km` : `${m} m`;
}

/** Year range in words, e.g. "1970–2025", "1970 onwards", "All years". */
export function yearsLabel([from, to]: OccurrenceQuery['years']): string {
  if (from === null && to === null) return 'All years';
  if (from === null) return `Up to ${to}`;
  if (to === null) return `${from} onwards`;
  return from === to ? String(from) : `${from}–${to}`;
}

/** Depth range in words, or null when unrestricted. */
export function depthLabel([min, max]: OccurrenceQuery['depth']): string | null {
  if (min === null && max === null) return null;
  if (min === null) return `Down to ${max} m`;
  if (max === null) return `Below ${min} m`;
  return `${min}–${max} m depth`;
}

/** Basis-of-record restriction in words, or null when every type is allowed. */
export function basisLabel(basis: readonly BasisOfRecord[]): string | null {
  const allowed = new Set(basisSet(basis));
  const excluded = ALL_BASIS.filter((b) => !allowed.has(b));
  if (excluded.length === 0) return null;
  const names = (list: BasisOfRecord[]) => list.map((b) => BASIS_LABELS[b].toLowerCase()).join(', ');
  if (excluded.length <= 3) return `Excludes ${names(excluded)}`;
  return `Only ${names(ALL_BASIS.filter((b) => allowed.has(b)))}`;
}

/** Active quality filters as short user-facing phrases. */
export function qualityLabels(q: QualityFilters): string[] {
  const out: string[] = [];
  const basis = basisLabel(q.basisOfRecord);
  if (basis) out.push(basis);
  if (q.maxUncertaintyMeters !== null) {
    out.push(
      `Coordinate uncertainty ≤ ${formatMeters(q.maxUncertaintyMeters)}${
        q.keepMissingUncertainty ? ' (or not reported)' : ''
      }`,
    );
  }
  if (q.excludeGeospatialIssues) out.push('No flagged coordinate issues');
  if (q.excludeIntroduced) out.push('Native populations only');
  if (q.presentOnly) out.push('Presences only');
  if (q.dedupe === 'exact') out.push('One record per species and site');
  if (q.dedupe === 'cell') out.push('One record per species and ~1 km cell');
  return out;
}

/** Taxa in words, e.g. "Felidae, Canidae + 2 more" or "All taxa". */
export function taxaLabel(taxa: readonly TaxonRef[], max = 3): string {
  if (taxa.length === 0) return 'All taxa';
  const names = taxa.map((t) => t.name);
  return names.length <= max
    ? names.join(', ')
    : `${names.slice(0, max).join(', ')} + ${names.length - max} more`;
}

export interface QueryDescription {
  taxa: string;
  area: string;
  years: string;
  depth: string | null;
  quality: string[];
}

/** Human-readable parts of a query, for summaries and chips. */
export function describeQuery(query: OccurrenceQuery): QueryDescription {
  return {
    taxa: taxaLabel(query.taxa),
    area: areaLabel(query.area),
    years: yearsLabel(query.years),
    depth: depthLabel(query.depth),
    quality: qualityLabels(query.quality),
  };
}

/** Short title, e.g. "Felidae · South America · 1970–2025". */
export function queryTitle(query: OccurrenceQuery): string {
  const d = describeQuery(query);
  const parts = [taxaLabel(query.taxa, 2), d.area];
  if (query.years[0] !== null || query.years[1] !== null) parts.push(d.years);
  return parts.join(' · ');
}

// --- URL encoding ---------------------------------------------------------------

const ENCODING_VERSION = 1;

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('not base64url');
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/** Compact URL-safe string for sharing a query (base64url of `{v: 1, q}`). */
export function encodeQuery(query: OccurrenceQuery): string {
  return toBase64Url(JSON.stringify({ v: ENCODING_VERSION, q: query }));
}

class InvalidQuery extends Error {}

function fail(): never {
  throw new InvalidQuery();
}

const isObj = (x: unknown): x is Record<string, unknown> =>
  x !== null && typeof x === 'object' && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

function parseTaxon(x: unknown): TaxonRef {
  if (!isObj(x) || typeof x.name !== 'string' || !x.name || typeof x.rank !== 'string') fail();
  const t: TaxonRef = { name: x.name, rank: x.rank };
  if (x.gbifKey !== undefined) t.gbifKey = isNum(x.gbifKey) ? x.gbifKey : fail();
  if (x.obisId !== undefined) t.obisId = isNum(x.obisId) ? x.obisId : fail();
  for (const key of ['vernacularName', 'path'] as const) {
    if (x[key] !== undefined) t[key] = typeof x[key] === 'string' ? x[key] : fail();
  }
  return t;
}

function parseArea(x: unknown): AreaFilter {
  if (!isObj(x)) fail();
  const label = typeof x.label === 'string' ? { label: x.label } : {};
  switch (x.kind) {
    case 'world':
      return { kind: 'world' };
    case 'bbox': {
      const b = x.bbox;
      if (!Array.isArray(b) || b.length !== 4 || !b.every(isNum)) fail();
      const [w, s, e, n] = b as number[];
      if (Math.abs(w) > 180 || Math.abs(e) > 180 || s < -90 || n > 90 || s >= n) fail();
      return { kind: 'bbox', bbox: [w, s, e, n], ...label };
    }
    case 'countries': {
      const known = new Set(COUNTRY_CODES);
      if (!Array.isArray(x.codes) || !x.codes.every((c) => typeof c === 'string' && known.has(c))) {
        fail();
      }
      return { kind: 'countries', codes: [...(x.codes as string[])] };
    }
    case 'wkt':
      if (typeof x.wkt !== 'string' || !/^\s*(MULTI)?POLYGON\s*\(/i.test(x.wkt)) fail();
      return { kind: 'wkt', wkt: x.wkt, ...label };
    default:
      fail();
  }
}

function parseRange(x: unknown, integer: boolean): [number | null, number | null] {
  if (!Array.isArray(x) || x.length !== 2) fail();
  const r = x.map((v) =>
    v === null ? null : isNum(v) && (!integer || Number.isInteger(v)) ? v : fail(),
  );
  return [r[0], r[1]];
}

function parseQuality(x: unknown, base: QualityFilters): QualityFilters {
  if (!isObj(x)) fail();
  const q = { ...base };
  if (x.basisOfRecord !== undefined) {
    const b = x.basisOfRecord;
    if (!Array.isArray(b) || !b.every((v) => ALL_BASIS.includes(v as BasisOfRecord))) fail();
    q.basisOfRecord = [...(b as BasisOfRecord[])];
  }
  if (x.maxUncertaintyMeters !== undefined) {
    const m = x.maxUncertaintyMeters;
    q.maxUncertaintyMeters = m === null || (isNum(m) && m >= 0) ? m : fail();
  }
  for (const key of [
    'keepMissingUncertainty',
    'excludeGeospatialIssues',
    'excludeIntroduced',
    'presentOnly',
  ] as const) {
    if (x[key] !== undefined) q[key] = typeof x[key] === 'boolean' ? x[key] : fail();
  }
  if (x.dedupe !== undefined) {
    q.dedupe = DEDUPE_MODES.includes(x.dedupe as DedupeMode) ? (x.dedupe as DedupeMode) : fail();
  }
  return q;
}

/**
 * Parse a string from `encodeQuery`. Missing fields fall back to `defaultQuery()`;
 * malformed fields or an unknown version give null.
 */
export function decodeQuery(s: string): OccurrenceQuery | null {
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(s.trim()));
    if (!isObj(parsed) || parsed.v !== ENCODING_VERSION || !isObj(parsed.q)) return null;
    const x = parsed.q;
    const q = defaultQuery();
    if (x.taxa !== undefined) q.taxa = Array.isArray(x.taxa) ? x.taxa.map(parseTaxon) : fail();
    if (x.area !== undefined) q.area = parseArea(x.area);
    if (x.years !== undefined) q.years = parseRange(x.years, true);
    if (x.depth !== undefined) q.depth = parseRange(x.depth, false);
    if (x.quality !== undefined) q.quality = parseQuality(x.quality, q.quality);
    if (x.sources !== undefined) {
      if (!isObj(x.sources)) fail();
      for (const id of SOURCE_IDS) {
        const v = x.sources[id];
        if (v !== undefined) q.sources[id] = typeof v === 'boolean' ? v : fail();
      }
    }
    return q;
  } catch {
    return null;
  }
}

/** Whether the query can be previewed and loaded; `reason` is shown to the user. */
export function isQueryRunnable(query: OccurrenceQuery): Supports {
  if (!SOURCE_IDS.some((id) => query.sources[id])) {
    return { ok: false, reason: 'Choose at least one data source (GBIF or OBIS).' };
  }
  if (query.area.kind === 'countries' && query.area.codes.length === 0) {
    return { ok: false, reason: 'Choose at least one country, or switch the area to World.' };
  }
  if (query.taxa.length === 0 && query.area.kind === 'world') {
    return {
      ok: false,
      reason: 'Add a taxon or limit the area: all life on Earth is too much to load.',
    };
  }
  const [y0, y1] = query.years;
  if (y0 !== null && y1 !== null && y0 > y1) {
    return { ok: false, reason: 'The start year is after the end year.' };
  }
  const [d0, d1] = query.depth;
  if (d0 !== null && d1 !== null && d0 > d1) {
    return { ok: false, reason: 'The minimum depth is greater than the maximum depth.' };
  }
  return { ok: true };
}
