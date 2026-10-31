// Methods text and citations of the loaded sources (pure). Spec §2.4.
import { gbifCitation } from '../../sources/methods';
import { queryKey } from '../../sources/query';
import { type LoadProvenance, buildMethodsText, buildObisCitation, citingDownload, provenanceEntries } from '../explorer/provenance';
import type { GbifDownload } from '../explorer/types';
import type { LoadedSource, OccurrenceSource, TreeSource, ZipOccurrences } from './types';

/** What the citations read beyond the sources. */
export interface CitationContext {
  /** Requested GBIF downloads (`ExplorerStore.downloads`): a matching one's DOI cites the GBIF part. */
  downloads?: (GbifDownload & { queryKey?: string })[];
}

/** The DOI that cites a load's GBIF records: from a dropped zip, else a download made for its query. */
function gbifDoi(load: LoadProvenance, ctx: CitationContext): string | undefined {
  return load.gbifDownloadDoi ?? citingDownload(load, ctx.downloads ?? [], queryKey(load.query))?.doi;
}

/** Live counts of the occurrence slot, read from SpeciesStore. */
export interface LiveCounts {
  records: number;
  species: number;
  polygons: number;
}

export interface CitationItem {
  id: string;
  sourceId: string;
  kind: 'gbif' | 'gbif-download' | 'obis' | 'example' | 'opentree';
  text: string;
  doi?: string;
}

/** What the methods text and the card say for an example with no known citation (§9.3). */
export const EXAMPLE_SOURCE_PLACEHOLDER = 'Infomap Bioregions example data';

const fmt = (n: number) => n.toLocaleString('en-US');

function countsText({ records, species }: LiveCounts): string {
  return `${fmt(records)} records of ${fmt(species)} species`;
}

function occurrenceSentence(source: OccurrenceSource, counts: LiveCounts, ctx: CitationContext): string {
  switch (source.kind) {
    case 'file':
      return `Occurrence data were loaded from the file ${source.files.map((f) => f.name).join(', ')} (${countsText(counts)}).`;
    case 'example': {
      const sentence = `Occurrence data: the Infomap Bioregions example "${source.label}" (${countsText(counts)}).`;
      return source.citation ? sentence : `${sentence} Source: ${EXAMPLE_SOURCE_PLACEHOLDER}.`;
    }
    case 'explorer-query':
    case 'gbif-zip':
      // A zip "Replace" carries the loaded query's provenance.
      if (source.provenance) return buildMethodsText({ load: source.provenance, downloadDoi: gbifDoi(source.provenance, ctx) });
      if (source.kind === 'gbif-zip') return zipSentence(source, counts);
      return `Occurrence data: ${source.label} (${countsText(counts)}).`;
  }
}

/** A GBIF download zip loaded on its own (no query). */
function zipSentence(source: ZipOccurrences, counts: LiveCounts): string {
  const d = source.download;
  // Stopped before the reader's summary: only the kept counts are known.
  if (!d) return `Occurrence records were taken from ${source.label} (stopped before the end of the file; ${countsText(counts)} kept).`;
  const name = d.key ? `GBIF download ${d.key}` : 'a GBIF download';
  const format = d.format === 'DWCA' ? 'DwC-A' : 'SIMPLE_CSV';
  return `Occurrence records were taken from ${name} (${format}; ${fmt(d.rows)} rows, ${fmt(d.absent)} absence records skipped; ${countsText(counts)} kept).`;
}

/** The citation of a zip loaded on its own: the zip's own text, else one built from its DOI. */
function zipCitation(source: ZipOccurrences): string | undefined {
  const d = source.download;
  if (d?.citation) return d.citation;
  return d?.doi ? `GBIF.org GBIF Occurrence Download https://doi.org/${d.doi}` : undefined;
}

function treeSentence(source: TreeSource): string {
  switch (source.kind) {
    case 'opentree':
      return source.citation;
    case 'file':
      return `Phylogeny: user-provided Newick tree ${source.file.name} (${fmt(source.tips)} tips).`;
    case 'example':
      return `Phylogeny: ${source.citation ?? 'example tree'}.`;
  }
}

/** The methods paragraph: empty exactly when nothing is loaded. */
export function methodsText(sources: LoadedSource[], counts: LiveCounts, ctx: CitationContext = {}): string {
  return sources
    .map((source) => {
      if (source.status === 'loading') return `Loading ${source.label}…`;
      return source.role === 'occurrences' ? occurrenceSentence(source, counts, ctx) : treeSentence(source);
    })
    .join(' ');
}

/** The citations of the loaded sources, each text once. A 'loading' source cites nothing yet. */
export function citations(sources: LoadedSource[], ctx: CitationContext = {}): CitationItem[] {
  const items: CitationItem[] = [];
  const add = (source: LoadedSource, kind: CitationItem['kind'], text: string | undefined, doi?: string) => {
    if (!text || items.some((item) => item.text === text)) return;
    items.push({ id: `${source.id}:${kind}`, sourceId: source.id, kind, text, ...(doi ? { doi } : {}) });
  };
  for (const source of sources) {
    if (source.status === 'loading') continue;
    switch (source.kind) {
      case 'example':
        add(source, 'example', source.citation);
        break;
      case 'opentree':
        add(source, 'opentree', source.citation, source.candidate.doi);
        break;
      case 'explorer-query':
      case 'gbif-zip': {
        const load = source.provenance;
        if (!load) {
          if (source.kind === 'gbif-zip') add(source, 'gbif-download', zipCitation(source), source.download?.doi);
          break;
        }
        // Only the sources that contributed records are cited.
        for (const entry of provenanceEntries(load, gbifDoi(load, ctx) ?? load.derivedDoi)) {
          if (entry.source === 'gbif') add(source, entry.doi ? 'gbif-download' : 'gbif', gbifCitation(entry), entry.doi);
          else add(source, 'obis', buildObisCitation(load));
        }
        break;
      }
      // 'file' cites nothing (the card says to cite the file's own source).
    }
  }
  return items;
}
