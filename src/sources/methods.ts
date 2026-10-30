// Citations and a pasteable methods paragraph for a loaded dataset.
import { BASIS_LABELS, basisLabel } from './query';
import { areaLabel } from './regions';
import type {
  DropReason,
  Funnel,
  OccurrenceQuery,
  ProvenanceEntry,
  QualityFilters,
  RecordSource,
} from './types';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "30 October 2026" (UTC) from an ISO timestamp; the input itself if unparsable. */
export function citationDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function citationYear(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 4) : String(d.getUTCFullYear());
}

const fmt = (n: number) => n.toLocaleString('en-US');

function doiUrl(doi: string): string {
  const bare = doi.trim().replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:)/i, '');
  return `https://doi.org/${bare}`;
}

/** GBIF citation: the download DOI when there is one, else the derived-dataset placeholder. */
export function gbifCitation(entry: ProvenanceEntry): string {
  const date = citationDate(entry.retrievedAt);
  if (entry.doi) return `GBIF.org (${date}) GBIF Occurrence Download ${doiUrl(entry.doi)}`;
  return `GBIF.org (${date}) GBIF Occurrence Data via API, derived dataset to be registered`;
}

export function obisCitation(entry: ProvenanceEntry): string {
  return `OBIS (${citationYear(entry.retrievedAt)}) Ocean Biodiversity Information System. Intergovernmental Oceanographic Commission of UNESCO. https://obis.org`;
}

/**
 * Records per GBIF dataset as "datasetKey,count" rows (header first), the format
 * GBIF's derived-dataset registration (https://www.gbif.org/derived-dataset/register)
 * accepts. Sorted by count, largest first.
 */
export function derivedDatasetCsv(entries: ProvenanceEntry[]): string {
  const counts = new Map<string, number>();
  for (const e of entries) {
    if (e.source !== 'gbif') continue;
    for (const d of e.datasets) counts.set(d.key, (counts.get(d.key) ?? 0) + d.count);
  }
  const rows = [...counts]
    .filter(([, n]) => n > 0)
    .sort(([ka, a], [kb, b]) => b - a || (ka < kb ? -1 : 1))
    .map(([k, n]) => `${k},${n}`);
  return ['datasetKey,count', ...rows].join('\n');
}

/** "a", "a and b", "a, b and c". */
function listing(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const SOURCE_NAMES: Record<RecordSource, string> = {
  gbif: 'the Global Biodiversity Information Facility (GBIF)',
  obis: 'the Ocean Biodiversity Information System (OBIS)',
  file: 'a local file',
};

function retrievalDates(entries: ProvenanceEntry[]): string {
  const dates = [...new Set(entries.map((e) => e.retrievedAt.slice(0, 10)))].sort();
  const first = citationDate(dates[0]);
  const last = citationDate(dates[dates.length - 1]);
  return first === last ? first : `${first} to ${last}`;
}

function sourcesSentence(entries: ProvenanceEntry[], query?: OccurrenceQuery): string {
  const bySource = new Map<RecordSource, ProvenanceEntry[]>();
  for (const e of entries) bySource.set(e.source, [...(bySource.get(e.source) ?? []), e]);
  const parts = [...bySource].map(([source, list]) => {
    const labels = listing([...new Set(list.map((e) => e.label))]);
    if (source === 'file') return `${list.length > 1 ? 'local files' : 'a local file'} (${labels})`;
    return `${SOURCE_NAMES[source]} (${labels}, retrieved ${retrievalDates(list)})`;
  });
  let scope = '';
  if (query) {
    const taxa = query.taxa.length === 0 ? 'all taxa' : listing(query.taxa.map((t) => t.name));
    const area = query.area.kind === 'world' ? 'worldwide' : `in ${areaLabel(query.area)}`;
    const [y0, y1] = query.years;
    const years =
      y0 === null && y1 === null
        ? ''
        : y0 === null
          ? ` recorded up to ${y1}`
          : y1 === null
            ? ` recorded from ${y0} onwards`
            : y0 === y1
              ? ` recorded in ${y0}`
              : ` recorded ${y0}–${y1}`;
    const [d0, d1] = query.depth;
    const depth =
      d0 === null && d1 === null
        ? ''
        : d0 === null
          ? ` at depths down to ${d1} m`
          : d1 === null
            ? ` at depths below ${d0} m`
            : ` at depths of ${d0}–${d1} m`;
    scope = ` of ${taxa} ${area}${years}${depth}`;
  }
  return `Occurrence records${scope} were obtained from ${listing(parts)}.`;
}

function qualitySentence(q: QualityFilters): string | null {
  const parts: string[] = [];
  const basis = basisLabel(q.basisOfRecord);
  if (basis) {
    const allowed = q.basisOfRecord.map((b) => BASIS_LABELS[b].toLowerCase());
    parts.push(`with basis of record ${listing(allowed)}`);
  }
  if (q.maxUncertaintyMeters !== null) {
    const m = q.maxUncertaintyMeters;
    const dist = m >= 1000 ? `${m / 1000} km` : `${m} m`;
    parts.push(
      `with a coordinate uncertainty of at most ${dist}${
        q.keepMissingUncertainty ? ' (records without a reported uncertainty were kept)' : ''
      }`,
    );
  }
  if (q.excludeGeospatialIssues) parts.push('without flagged geospatial issues');
  if (q.excludeIntroduced) {
    parts.push('not recorded as introduced, managed, invasive or naturalised');
  }
  if (q.presentOnly) parts.push('recording presences (absence records excluded)');
  return parts.length === 0 ? null : `We kept only records ${listing(parts)}.`;
}

const DEDUPE_TEXT = {
  none: '',
  exact:
    ' Duplicate records of the same species at the same coordinates (rounded to four decimal places, about 11 m) were removed across sources.',
  cell: ' Records were thinned across sources to one per species and 0.01° grid cell (about 1 km).',
};

const DROP_TEXT: Record<DropReason, string> = {
  noSpecies: 'without a species-level name',
  invalidCoordinates: 'with invalid coordinates',
  zeroCoordinates: 'at (0, 0)',
  outsideArea: 'outside the study area',
  duplicate: 'duplicates',
  lowCount: 'of species below the minimum record count',
};

function cleaningSentence(
  funnel: Funnel | null,
  entries: ProvenanceEntry[],
  speciesCount: number,
  query?: OccurrenceQuery,
): string {
  const base =
    'Names were reduced to species binomials (infraspecific names merged into their species; genus-only, open-nomenclature and hybrid-formula names discarded), and records with missing, invalid or (0, 0) coordinates were removed.';
  const dedupe = query ? DEDUPE_TEXT[query.quality.dedupe] : '';
  const received = funnel?.received ?? entries.reduce((s, e) => s + e.fetched, 0);
  const accepted = funnel?.accepted ?? entries.reduce((s, e) => s + e.accepted, 0);
  let counts = `The final dataset has ${fmt(accepted)} records of ${fmt(speciesCount)} species`;
  if (received > accepted) {
    counts += ` (of ${fmt(received)} records received`;
    if (funnel) {
      const drops = (Object.keys(DROP_TEXT) as DropReason[])
        .filter((r) => funnel.dropped[r] > 0)
        .map((r) => `${fmt(funnel.dropped[r])} ${DROP_TEXT[r]}`);
      if (drops.length > 0) counts += `; removed: ${drops.join(', ')}`;
    }
    counts += ')';
  }
  counts += '.';
  const truncated = entries.reduce((s, e) => s + (e.truncated ?? 0), 0);
  const cap =
    truncated > 0
      ? ` Retrieval was capped, so ${fmt(truncated)} matching records were not downloaded.`
      : '';
  return `${base}${dedupe} ${counts}${cap}`;
}

export interface PhylogenyInfo {
  citation: string;
  label: string;
  tips: number;
  matched: number;
  branchLengths: 'original' | 'grafen' | 'none';
}

function phylogenySentence(p: PhylogenyInfo, speciesCount: number): string {
  const share =
    speciesCount > 0 ? ` (${Math.round((100 * p.matched) / speciesCount)}% of the species)` : '';
  const lengths = {
    original: 'with its original branch lengths',
    grafen:
      "with branch lengths computed by Grafen's (1989) method (ρ = 1), since the tree has topology only",
    none: 'as a topology without branch lengths',
  }[p.branchLengths];
  return `Phylogenetic relationships were taken from ${p.label} (${p.citation}), used ${lengths}; ${fmt(p.matched)} of its ${fmt(p.tips)} tips matched species in the occurrence data${share}.`;
}

export interface MethodsInput {
  entries: ProvenanceEntry[];
  funnel: Funnel | null;
  speciesCount: number;
  query?: OccurrenceQuery;
  phylogeny?: PhylogenyInfo;
}

/** An English methods paragraph describing retrieval, filtering, cleaning and citations. */
export function methodsParagraph(input: MethodsInput): string {
  const { entries, funnel, speciesCount, phylogeny } = input;
  const query = input.query ?? entries.find((e) => e.query)?.query;
  const sentences: string[] = [];
  if (entries.length > 0) sentences.push(sourcesSentence(entries, query));
  const quality = query ? qualitySentence(query.quality) : null;
  if (quality) sentences.push(quality);
  sentences.push(cleaningSentence(funnel, entries, speciesCount, query));
  if (phylogeny) sentences.push(phylogenySentence(phylogeny, speciesCount));

  const citations = new Set<string>();
  for (const e of entries) {
    if (e.source === 'gbif') citations.add(gbifCitation(e));
    if (e.source === 'obis') citations.add(obisCitation(e));
  }
  if (citations.size > 0) sentences.push(`Data citations: ${[...citations].join('; ')}.`);
  return sentences.join(' ');
}
