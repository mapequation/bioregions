// Provenance of a load turned into citation text: methods paragraph, OBIS citation,
// GBIF derived-dataset CSV and the decision ledger as CSV.
import { type PhylogenyInfo, derivedDatasetCsv, methodsParagraph, obisCitation } from '../../sources/methods';
import type { DropReason, Funnel, OccurrenceQuery, ProvenanceEntry, SourceId } from '../../sources/types';
import type { GbifDownload, LedgerRow, PartialLoad, Provenance } from './types';

/** Provenance kept for the last load: the shared shape plus the exact requests sent. */
export interface LoadProvenance extends Provenance {
  /** GBIF download predicate JSON and OBIS query parameters, per source. */
  requests?: Partial<Record<SourceId, unknown>>;
  /** Bare DOI of the GBIF download that cites this load (from a dropped zip). */
  gbifDownloadDoi?: string;
  /** The GBIF records came from the download zip rather than the API. */
  fromZip?: boolean;
  /**
   * After an empty load that left the previous dataset on screen (`previousKept`): the
   * provenance of that dataset, for citing what is still shown.
   */
  previous?: LoadProvenance;
}

const SOURCE_LABELS: Record<SourceId, string> = {
  gbif: 'GBIF occurrence API',
  obis: 'OBIS API',
};

const fmt = (n: number) => n.toLocaleString('en-US');

/** The download whose DOI cites this load: the one applied from a zip, else the newest SUCCEEDED one for the same query. */
export function citingDownload(
  load: Pick<Provenance, 'gbifDownloadKey'> | null,
  downloads: (GbifDownload & { queryKey?: string })[],
  queryKey: string | null,
): GbifDownload | null {
  if (load?.gbifDownloadKey) {
    const d = downloads.find((x) => x.key === load.gbifDownloadKey);
    if (d) return d;
    return { key: load.gbifDownloadKey, status: 'SUCCEEDED', createdAt: '' };
  }
  const ok = downloads.filter((d) => d.status === 'SUCCEEDED' && d.doi && (!queryKey || d.queryKey === queryKey));
  return ok.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0] ?? null;
}

/** One provenance entry per source that contributed to the load. */
export function provenanceEntries(load: LoadProvenance, gbifDoi?: string): ProvenanceEntry[] {
  const out: ProvenanceEntry[] = [];
  for (const id of ['gbif', 'obis'] as SourceId[]) {
    const counts = load.funnel.bySource[id];
    // Only sources that contributed records are named and cited.
    if (!load.query.sources[id] || !counts || counts.accepted <= 0) continue;
    out.push({
      id,
      source: id,
      label: id === 'gbif' && load.fromZip && load.gbifDownloadKey ? `GBIF download ${load.gbifDownloadKey}` : SOURCE_LABELS[id],
      retrievedAt: load.retrievedAt,
      query: load.query,
      request: load.requests?.[id],
      doi: id === 'gbif' ? gbifDoi : undefined,
      downloadKey: id === 'gbif' ? load.gbifDownloadKey : undefined,
      fetched: counts.received,
      accepted: counts.accepted,
      datasets: (load.datasetCounts[id] ?? []).map((b) => ({ key: b.key, title: b.label, count: b.count })),
    });
  }
  return out;
}

/** Draft entries for a query that has not been loaded yet. */
function draftEntries(query: OccurrenceQuery, now: string, gbifDoi?: string, sources?: SourceId[]): ProvenanceEntry[] {
  return (['gbif', 'obis'] as SourceId[])
    .filter((id) => query.sources[id] && (!sources || sources.includes(id)))
    .map((id) => ({
      id,
      source: id,
      label: SOURCE_LABELS[id],
      retrievedAt: now,
      query,
      doi: id === 'gbif' ? gbifDoi : undefined,
      fetched: 0,
      accepted: 0,
      datasets: [],
    }));
}

/** Share of planned records as text: "56 %", "<1 %" or ">99 %" (never a misleading 0 % or 100 %). */
function partialPct(accepted: number, planned: number): string {
  if (planned <= 0) return '0 %';
  const pct = (100 * accepted) / planned;
  if (pct > 0 && pct < 1) return '<1 %';
  if (pct > 99 && pct < 100) return '>99 %';
  return `${Math.round(pct)} %`;
}

/**
 * "Loading was stopped early: 819 of ~272,546 planned records (<1 %) from 1 of 210 species
 * were loaded; because records stream species by species, the missing species are absent
 * rather than thinned."
 */
export function partialSentence(partial: PartialLoad, bioregionsSkipped = false): string {
  const { planned, accepted, speciesLoaded, speciesPlanned } = partial;
  const records = `${fmt(accepted)} of ~${fmt(planned)} planned records (${partialPct(accepted, planned)})`;
  const head = 'Loading was stopped early:';
  if (speciesPlanned != null && speciesPlanned > 0 && speciesLoaded >= speciesPlanned) {
    return `${head} ${records} from all ${fmt(speciesPlanned)} species were loaded.`;
  }
  const known = speciesPlanned != null && speciesPlanned > 0;
  const species = known ? `${fmt(speciesLoaded)} of ${fmt(speciesPlanned)}` : fmt(speciesLoaded);
  const coverage = known
    ? ` Species coverage is ${partialPct(speciesLoaded, speciesPlanned)}`
    : ` Record coverage is ${partialPct(accepted, planned)}`;
  const regions = bioregionsSkipped ? '; bioregions were not computed for this incomplete dataset.' : '.';
  return `${head} ${records} from ${species} species were loaded; because records stream species by species, the missing species are absent rather than thinned.${coverage}${regions}`;
}

/** Share of the planned species that arrived (records when the species are unknown), 0..1. */
export function partialCoverage(p: Pick<PartialLoad, 'planned' | 'accepted' | 'speciesLoaded' | 'speciesPlanned'>): number {
  if (p.speciesPlanned != null && p.speciesPlanned > 0) return Math.min(1, p.speciesLoaded / p.speciesPlanned);
  return p.planned > 0 ? Math.min(1, p.accepted / p.planned) : 0;
}

export interface MethodsTextInput {
  load: LoadProvenance | null;
  /** The query being edited, used for a draft before the first load. */
  query: OccurrenceQuery;
  /** Sources a draft names (enabled, supported, with matching records); default: all enabled. */
  sources?: SourceId[];
  /** Download DOI (bare) that cites the GBIF part. */
  downloadDoi?: string;
  /** Tree citation from PhyloStore (empty when no tree was loaded). */
  treeCitation?: string;
  phylogeny?: PhylogenyInfo;
  speciesCount?: number;
  now?: string;
}

/** Methods paragraph for the last load, or a draft for the current query. */
export function buildMethodsText(input: MethodsTextInput): string {
  const { load, query } = input;
  if (!load) {
    const text = methodsParagraph({
      entries: draftEntries(query, input.now ?? new Date().toISOString(), input.downloadDoi, input.sources),
      funnel: null,
      speciesCount: 0,
      query,
    });
    // A draft has no counts yet: drop the "final dataset" sentence.
    const draft = text.replace(/ The final dataset has 0 records of 0 species\./, '');
    const min = query.quality.minRecordsPerSpecies ?? 1;
    return min > 1 ? insertBeforeCitations(draft, `Species with fewer than ${min} records were left out.`) : draft;
  }
  const derivedDoi = input.downloadDoi ? undefined : load.derivedDoi;
  const entries = provenanceEntries(load, input.downloadDoi ?? derivedDoi);
  let text = methodsParagraph({
    entries,
    funnel: load.funnel,
    speciesCount: input.speciesCount ?? load.kpis.species ?? 0,
    query: load.query,
    phylogeny: input.phylogeny,
  });
  if (derivedDoi) {
    // gbifCitation formats any DOI as a download; a registered derived dataset is cited as a filtered export.
    text = text.replace(/GBIF Occurrence Download (https:\/\/doi\.org\/\S+?)(?=[;.]?(\s|$))/, 'Filtered export of GBIF occurrence data $1');
  }
  const min = load.query.quality.minRecordsPerSpecies ?? 1;
  if (min > 1 && !text.includes(`fewer than ${min} records`)) {
    text = insertBeforeCitations(text, `Species with fewer than ${min} records were left out.`);
  }
  if (load.partial) text = insertBeforeCitations(text, partialSentence(load.partial, load.bioregionsSkipped));
  if (input.treeCitation && !input.phylogeny) {
    text = insertBeforeCitations(text, `Phylogeny: ${input.treeCitation.replace(/\.$/, '')}.`);
  }
  return text;
}

/** Insert a sentence before "Data citations:", or append it. */
function insertBeforeCitations(text: string, sentence: string): string {
  const i = text.indexOf('Data citations:');
  return i < 0 ? `${text} ${sentence}` : `${text.slice(0, i)}${sentence} ${text.slice(i)}`;
}

/** OBIS citation with the contributing dataset ids. */
export function buildObisCitation(load: LoadProvenance | null, now = new Date().toISOString()): string {
  const retrievedAt = load?.retrievedAt ?? now;
  const base = obisCitation({
    id: 'obis',
    source: 'obis',
    label: SOURCE_LABELS.obis,
    retrievedAt,
    fetched: 0,
    accepted: 0,
    datasets: [],
  });
  const ids = (load?.datasetCounts.obis ?? []).map((b) => b.key);
  return ids.length > 0 ? `${base}. Datasets: ${ids.join(', ')}` : base;
}

/** GBIF datasetKey,count CSV for the derived-dataset registration. */
export function buildDatasetCsv(load: LoadProvenance | null): string {
  return derivedDatasetCsv(load ? provenanceEntries(load) : []);
}

const DROP_LABELS: Record<DropReason, string> = {
  noSpecies: 'No species-level name',
  invalidCoordinates: 'Invalid coordinates',
  zeroCoordinates: 'Coordinates (0, 0)',
  outsideArea: 'Outside area',
  duplicate: 'Duplicates within a source',
  crossSource: 'Same record in GBIF and OBIS',
  lowCount: 'Species below minimum records',
};

function csvCell(v: string | number | boolean | null | undefined): string {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Ledger CSV: filter-impact rows, then the cleaning funnel when a load ran. */
export function buildLedgerCsv(ledger: LedgerRow[], funnel: Funnel | null): string {
  const rows: (string | number | boolean | null | undefined)[][] = [
    ['section', 'step', 'active', 'records', 'share'],
  ];
  for (const r of ledger) {
    // Duplicates are removed while loading; the cleaning rows below report them.
    if (r.id === 'duplicates' || r.id === 'crossSource') continue;
    rows.push([
      'filter impact',
      r.label,
      r.active,
      r.impact == null ? null : -r.impact,
      r.share == null ? null : Math.round(r.share * 1e4) / 1e4,
    ]);
  }
  if (funnel) {
    rows.push(['cleaning', 'Received', true, funnel.received, null]);
    for (const reason of Object.keys(DROP_LABELS) as DropReason[]) {
      const n = funnel.dropped[reason] ?? 0;
      if (n > 0) {
        rows.push([
          'cleaning',
          DROP_LABELS[reason],
          true,
          -n,
          funnel.received > 0 ? Math.round((n / funnel.received) * 1e4) / 1e4 : null,
        ]);
      }
    }
    rows.push(['cleaning', 'Accepted', true, funnel.accepted, null]);
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\n');
}
