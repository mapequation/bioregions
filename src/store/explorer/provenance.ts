// Provenance of a load turned into citation text: methods paragraph, OBIS citation,
// GBIF derived-dataset CSV and the decision ledger as CSV.
import { type PhylogenyInfo, citationDate, derivedDatasetCsv, methodsParagraph, obisCitation } from '../../sources/methods';
import type { DropReason, Funnel, ProvenanceEntry, SourceId } from '../../sources/types';
import type { StopState } from '../data/types';
import type { LoadStats } from './job';
import type { GbifDownload, LedgerRow, PartialLoad, Provenance } from './types';

/** Provenance kept for the last load: the shared shape plus the exact requests sent. */
export interface LoadProvenance extends Provenance {
  /** GBIF download predicate JSON and OBIS query parameters, per source. */
  requests?: Partial<Record<SourceId, unknown>>;
  /** Bare DOI of the GBIF download that cites this load (from a dropped zip). */
  gbifDownloadDoi?: string;
  /** The GBIF records came from the download zip rather than the API. */
  fromZip?: boolean;
  /** Statistics of the accepted records (basis, datasets, years, species, countries). */
  stats?: LoadStats;
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

/** Share of planned records as text: "56 %", "<1 %" or ">99 %" (never a misleading 0 % or 100 %). */
function partialPct(accepted: number, planned: number): string {
  if (planned <= 0) return '0 %';
  const pct = (100 * accepted) / planned;
  if (pct > 0 && pct < 1) return '<1 %';
  if (pct > 99 && pct < 100) return '>99 %';
  return `${Math.round(pct)} %`;
}

const SOURCE_SHORT: Record<SourceId, string> = { gbif: 'GBIF', obis: 'OBIS' };

/** "GBIF", "GBIF and OBIS", or "the data sources" when none is named. */
function sourceNames(ids: SourceId[]): string {
  const names = ids.map((id) => SOURCE_SHORT[id] ?? id);
  if (names.length === 0) return 'the data sources';
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const requestsText = (n: number) => `${fmt(n)} ${n === 1 ? 'request' : 'requests'}`;

/**
 * The stop in a few words, for one-line status rows and the source card (spec §4.4):
 * "you stopped the load", the last error, or "stopped at the cap".
 */
export function stopShort(stop: StopState): string {
  if (stop.reason === 'cancelled') return 'you stopped the load';
  if (stop.reason === 'cap') return 'stopped at the cap';
  return stop.lastError ?? `requests to ${sourceNames(stop.sources)} failed`;
}

/**
 * Why a load stopped, for the partial banner (spec §4.4): the user stopped it, repeated
 * errors ended it (`stoppedEarly`), some requests failed after their retries, or a source
 * reached the record `cap` because the estimate was low.
 */
export function stopSentence(stop: StopState, cap: number): string {
  const from = sourceNames(stop.sources);
  const error = stop.lastError ?? 'request error';
  switch (stop.reason) {
    case 'cancelled':
      return 'You stopped the load before every record arrived.';
    case 'cap': {
      const estimate = stop.estimate != null ? `; the estimate was ~${fmt(stop.estimate)}, so` : ', so';
      return `${from} stopped at the cap of ${fmt(cap)} records${estimate} more records may exist.`;
    }
    case 'errors': {
      if (stop.stoppedEarly) {
        const open = stop.requests != null && stop.requestsDone != null ? stop.requests - stop.requestsDone : 0;
        const missing = Math.max(open, stop.failedParts);
        return `Loading stopped after repeated errors from ${from}: ${error}.${missing > 0 ? ` ${requestsText(missing)} did not complete.` : ''}`;
      }
      if (stop.failedParts > 0) {
        return `${requestsText(stop.failedParts)} to ${from} still failed after retries (${error}); everything else loaded.`;
      }
      return `${from} failed (${error}); everything else loaded.`;
    }
  }
}

/**
 * The partial-load sentence of the methods text, by stop reason (spec §4.4). Cancelled (or
 * no stop): "Loading was stopped early: 819 of ~272,546 planned records (<1 %) from 1 of
 * 210 species were loaded; requests alternate packed batches of small species with parts
 * of large ones, so the missing species are absent rather than thinned, and species still
 * being fetched have fewer records than they would. The largest of the 209 missing species
 * are A b (~9,000 planned records), C d (~450) and E f (~30). Species coverage is <1 %."
 * A cap stop starts "Loading stopped at the record cap of {cap}:"; request errors give
 * "Loading ended early after request errors: {n} of {m} requests failed, …".
 */
export function partialSentence(
  partial: PartialLoad,
  bioregionsSkipped = false,
  stop: StopState | null = null,
  cap?: number,
): string {
  const { planned, accepted, speciesLoaded, speciesPlanned } = partial;
  const records = `${fmt(accepted)} of ~${fmt(planned)} planned records (${partialPct(accepted, planned)})`;
  const regions = bioregionsSkipped ? '; bioregions were not computed for this incomplete dataset.' : '.';
  if (stop?.reason === 'errors') {
    const failed =
      stop.failedParts > 0
        ? `${fmt(stop.failedParts)} of ${stop.requests != null ? requestsText(Math.max(stop.requests, stop.failedParts)) : 'the requests'} failed`
        : `requests to ${sourceNames(stop.sources)} failed`;
    return `Loading ended early after request errors: ${failed}, so records for some species, areas or years may be missing${regions}`;
  }
  const head =
    stop?.reason === 'cap' && cap != null ? `Loading stopped at the record cap of ${fmt(cap)}:` : 'Loading was stopped early:';
  const known = speciesPlanned != null && speciesPlanned > 0;
  if (!known) {
    return `${head} ${records} from ${fmt(speciesLoaded)} species were loaded; the planned species are unknown, and later records were not received, so record counts per species are not representative. Record coverage is ${partialPct(accepted, planned)}${regions}`;
  }
  if (partial.kind === 'recordsTruncated') {
    return `${head} ${records} were loaded; all ${fmt(speciesPlanned)} species are present, but later records were not received, so record counts per species are not representative${regions}`;
  }
  const species = `${fmt(speciesLoaded)} of ${fmt(speciesPlanned)}`;
  return `${head} ${records} from ${species} species were loaded; requests alternate packed batches of small species with parts of large ones, so the missing species are absent rather than thinned, and species still being fetched have fewer records than they would.${missingSentence(partial)} Species coverage is ${partialPct(speciesLoaded, speciesPlanned)}${regions}`;
}

/** " The largest of the 209 missing species are A b (~9,000 planned records), C d (~450) and E f (~30)." */
function missingSentence(partial: PartialLoad): string {
  const top = (partial.missingSpecies ?? []).slice(0, 3);
  if (top.length === 0) return '';
  const missing = Math.max(top.length, (partial.speciesPlanned ?? 0) - partial.speciesLoaded);
  const names = top.map((m, i) => `${m.name} (~${fmt(m.expected)}${i === 0 ? ' planned records' : ''})`);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
  if (missing <= top.length) {
    return missing === 1 ? ` The missing species is ${list}.` : ` The missing species are ${list}.`;
  }
  return ` The largest of the ${fmt(missing)} missing species are ${list}.`;
}

/** Whole species are missing (fewer arrived than planned), or only later records were cut. */
export function partialKind(speciesLoaded: number, speciesPlanned: number | null): PartialLoad['kind'] {
  return speciesPlanned != null && speciesLoaded < speciesPlanned ? 'speciesMissing' : 'recordsTruncated';
}

/** Share of the planned species that arrived (records when the species are unknown), 0..1. */
export function partialCoverage(p: Pick<PartialLoad, 'planned' | 'accepted' | 'speciesLoaded' | 'speciesPlanned'>): number {
  if (p.speciesPlanned != null && p.speciesPlanned > 0) return Math.min(1, p.speciesLoaded / p.speciesPlanned);
  return p.planned > 0 ? Math.min(1, p.accepted / p.planned) : 0;
}

export interface MethodsTextInput {
  load: LoadProvenance;
  /** Download DOI (bare) that cites the GBIF part. */
  downloadDoi?: string;
  /** Tree citation from PhyloStore (empty when no tree was loaded). */
  treeCitation?: string;
  phylogeny?: PhylogenyInfo;
  speciesCount?: number;
}

/**
 * Methods paragraph for a load. There is no draft for an unloaded query: the methods text
 * describes only loaded data (I4).
 */
export function buildMethodsText(input: MethodsTextInput): string {
  const { load } = input;
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
  if (load.partial) {
    text = insertBeforeCitations(text, partialSentence(load.partial, load.bioregionsSkipped, load.stop, load.cap));
  }
  text = retrievedBetween(text, load);
  if (input.treeCitation && !input.phylogeny) {
    text = insertBeforeCitations(text, `Phylogeny: ${input.treeCitation.replace(/\.$/, '')}.`);
  }
  return text;
}

/**
 * A load finished (or last continued) on a later day than it started: its sources were
 * "retrieved between {first day} and {last day}" rather than on the first day.
 */
function retrievedBetween(text: string, load: LoadProvenance): string {
  if (!load.completedAt || load.completedAt <= load.retrievedAt) return text;
  const first = citationDate(load.retrievedAt);
  const last = citationDate(load.completedAt);
  if (first === last) return text;
  return text.split(`retrieved ${first})`).join(`retrieved between ${first} and ${last})`);
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
