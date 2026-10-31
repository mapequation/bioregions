// Methods text and citations of the loaded sources (pure). Spec §2.4.
import type { LoadedSource, OccurrenceSource, TreeSource } from './types';

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

function occurrenceSentence(source: OccurrenceSource, counts: LiveCounts): string {
  switch (source.kind) {
    case 'file':
      return `Occurrence data were loaded from the file ${source.files.map((f) => f.name).join(', ')} (${countsText(counts)}).`;
    case 'example': {
      const sentence = `Occurrence data: the Infomap Bioregions example "${source.label}" (${countsText(counts)}).`;
      return source.citation ? sentence : `${sentence} Source: ${EXAMPLE_SOURCE_PLACEHOLDER}.`;
    }
    // TODO(S2a, S2b): the stream and zip sentences (buildMethodsText, the GBIF download).
    case 'explorer-query':
    case 'gbif-zip':
      return `Occurrence data: ${source.label} (${countsText(counts)}).`;
  }
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
export function methodsText(sources: LoadedSource[], counts: LiveCounts): string {
  return sources
    .map((source) => {
      if (source.status === 'loading') return `Loading ${source.label}…`;
      return source.role === 'occurrences' ? occurrenceSentence(source, counts) : treeSentence(source);
    })
    .join(' ');
}

/** The citations of the loaded sources, each text once. A 'loading' source cites nothing yet. */
export function citations(sources: LoadedSource[]): CitationItem[] {
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
      // 'file' cites nothing (the card says to cite the file's own source).
      // TODO(S2a, S2b): GBIF, OBIS and GBIF-download citations.
    }
  }
  return items;
}
