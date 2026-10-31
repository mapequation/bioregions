/**
 * Pure models for the sidebar's source cards (spec §5.5). `sourceCards` derives every card from
 * `dataStore.sources` and the running jobs only, so a card can never outlive its source.
 * `SourceCards.tsx` renders the models.
 */
import { queryTitle } from '@/sources';
import type { DataLoadJob, LoadedSource, OccurrenceSource, TreeJob, TreeSource } from '../../store/data/types';
import { EXAMPLE_CITATION_PLACEHOLDER } from '../../store/data/catalog';
import { stopShort } from '../../store/explorer/provenance';
import { fmtCompact, fmtInt } from '../Explorer/format';

export type CardActionId =
  | 'edit'
  | 'cite'
  | 'remove'
  | 'continue'
  | 'loadAgain'
  | 'replace'
  | 'examples'
  | 'change'
  | 'open'
  | 'stop';

export interface CardAction {
  id: CardActionId;
  label: string;
  tooltip: string;
  /** The reason the action is unavailable; shown in place of the tooltip. */
  disabled?: string;
}

export interface StopOption {
  mode: 'keep' | 'discard';
  label: string;
}

export interface SourceCardModel {
  /** Stable React key: the source id, or the job id for a job row. */
  key: string;
  role: 'occurrences' | 'tree' | 'job';
  title: string;
  kindLabel: string;
  stats: string[];
  badges: { text: string; tooltip: string }[];
  status?: { tone: 'info' | 'warning' | 'error'; text: string };
  /** Visible lines below the stats (information that must not live only in a tooltip). */
  notes: string[];
  /** A running load: `value`/`max` null for an indeterminate bar. */
  progress?: { value: number | null; max: number | null; text: string };
  primary: CardAction[];
  menu: CardAction[];
  /** Choices of the Stop menu (present exactly when a `stop` action is). */
  stopOptions?: StopOption[];
  /** The Remove popover's question. */
  removePrompt?: string;
  /** Where `open` takes the user. */
  openTab?: DataLoadJob['origin'];
}

export interface SourceCardsInput {
  sources: LoadedSource[];
  job: DataLoadJob | null;
  treeJob: TreeJob | null;
  overlap: { tips: number; inTree: number; datasetSpecies: number } | null;
  counts: { records: number; species: number; polygons: number };
  includeTree: boolean;
  /** `dataStore.continueCap`: null when the loaded data is not resumable. */
  continueCap: number | null;
  /** `dataStore.isLoading`: true also while a load guard is held (an example's tree phase). */
  loading: boolean;
  /** `infomapStore.noCellsCapacity`: set when Infomap found no grid cells to cluster. */
  noCellsCapacity: number | null;
}

/** The hint shown when the records cannot fill a single grid cell. */
export const tooFewRecordsHint = (capacity: number) =>
  `Too few records to fill a grid cell (cell capacity ${capacity}). Lower the cell capacity under Resolution.`;

/** Keeps year ranges such as 1970–2025 on one line (word joiners around the dash). */
export const keepRangesTogether = (s: string) => s.replace(/(\d)–(\d)/g, '$1⁠–⁠$2');

const BUSY = 'Not available while data is loading';

/** A job counts as running while it plans, streams or finishes (`dataStore.isLoading`). */
export function isRunning(job: DataLoadJob | null): job is DataLoadJob {
  return job != null && (job.state === 'planning' || job.state === 'streaming' || job.state === 'finishing');
}

function recordStats(counts: SourceCardsInput['counts'], suffix?: string): string[] {
  const parts = [`${fmtInt(counts.records)} records`, `${fmtInt(counts.species)} species`];
  if (counts.polygons > 0) parts.push(`${fmtInt(counts.polygons)} polygons`);
  if (suffix) parts.push(suffix);
  return [parts.join(' · ')];
}

const action = (id: CardActionId, label: string, tooltip: string, disabled?: string): CardAction =>
  disabled ? { id, label, tooltip, disabled } : { id, label, tooltip };

const CITE = (what: string) => action('cite', 'Cite', `Open the Cite tab: a methods paragraph and citations for ${what}`);

function removeOccurrences(busy: boolean): CardAction {
  return action(
    'remove',
    'Remove',
    'Remove the occurrence records and the bioregions computed from them; the tree stays',
    busy ? BUSY : undefined,
  );
}

/** Records the running job has accepted so far (file loads count in SpeciesStore). */
function jobRecords(job: DataLoadJob, counts: SourceCardsInput['counts']): number {
  return job.kind === 'file' || job.kind === 'example' ? counts.records : job.funnel.accepted;
}

/** The progress bar and its text for a running occurrence job. */
export function jobProgress(job: DataLoadJob, counts: SourceCardsInput['counts']): SourceCardModel['progress'] {
  if (job.state === 'planning') return { value: null, max: null, text: 'Planning…' };
  if (job.state === 'finishing') return { value: null, max: null, text: 'Finishing…' };
  if (job.kind === 'file' || job.kind === 'example' || job.perSource.length === 0) {
    return { value: null, max: null, text: `${fmtInt(jobRecords(job, counts))} records` };
  }
  const fetched = job.perSource.reduce((s, p) => s + p.fetched, 0);
  const expected = job.perSource.reduce((s, p) => s + p.expected, 0);
  const names = job.perSource.map((p) => p.source.toUpperCase()).join(' + ');
  if (expected <= 0) return { value: null, max: null, text: `${names} ${fmtCompact(fetched)}` };
  return {
    value: Math.min(fetched, expected),
    max: expected,
    text: `${names} ${fmtCompact(fetched)} / ${fmtCompact(expected)}`,
  };
}

/** The Stop menu's choices: keep what arrived, and cancel (before the commit) or discard (after). */
export function stopOptions(job: DataLoadJob, counts: SourceCardsInput['counts'], hadPrevious: boolean): StopOption[] {
  const n = jobRecords(job, counts);
  const keep: StopOption = { mode: 'keep', label: `Stop and keep ${fmtInt(n)} records` };
  // A Continue keeps what it appended; a file load keeps what arrived whichever mode is chosen.
  if (job.kind === 'continue' || job.kind === 'file' || job.kind === 'example') return [keep];
  if (job.committed) return [keep, { mode: 'discard', label: `Discard the ${fmtInt(n)} records loaded so far` }];
  const cancel: StopOption = {
    mode: 'discard',
    label: hadPrevious ? 'Cancel; keep the previous data' : 'Cancel the load',
  };
  return n > 0 ? [keep, cancel] : [cancel];
}

function jobActions(job: DataLoadJob): { primary: CardAction[]; openTab?: DataLoadJob['origin'] } {
  const primary: CardAction[] = [];
  const showOpen = job.origin !== 'sidebar' && job.kind !== 'file';
  if (showOpen) primary.push(action('open', 'Open', 'Show this load in the Data portal'));
  if (job.state !== 'finishing') {
    primary.push(action('stop', 'Stop', 'Stop the load: keep what arrived, or cancel it'));
  }
  return showOpen ? { primary, openTab: job.origin } : { primary };
}

function occurrenceCard(source: OccurrenceSource, input: SourceCardsInput, busy: boolean): SourceCardModel {
  const { counts } = input;
  const base = { key: source.id, role: 'occurrences' as const, badges: [], notes: [] as string[] };
  const removePrompt = `Remove ${fmtInt(counts.records)} records?`;
  switch (source.kind) {
    case 'explorer-query': {
      const stop = source.provenance?.stop ?? null;
      const primary = [
        action('edit', 'Edit query', 'Open Search GBIF & OBIS to change the query and load again'),
        CITE('this query'),
      ];
      if (source.resumable && input.continueCap != null) {
        const cap = stop?.reason === 'cap';
        primary.push(
          action(
            'continue',
            cap ? `Continue up to ${fmtInt(input.continueCap)}` : 'Continue loading',
            cap
              ? `Raise the cap to ${fmtInt(input.continueCap)} records and fetch the rest from where the load stopped`
              : 'Fetch the remaining records from where the load stopped and add them to the loaded data',
            busy ? BUSY : undefined,
          ),
        );
      }
      return {
        ...base,
        title: keepRangesTogether(queryTitle(source.query)),
        kindLabel: source.exampleId ? 'Example' : 'GBIF + OBIS query',
        stats: recordStats(counts, stop ? 'partial' : undefined),
        ...(stop ? { status: { tone: 'warning' as const, text: `Partial: ${stopShort(stop)}` } } : {}),
        primary,
        menu: [
          action(
            'loadAgain',
            'Load again',
            'Run the same query again from the start; the new records replace these',
            busy ? BUSY : undefined,
          ),
          removeOccurrences(busy),
        ],
        removePrompt,
      };
    }
    case 'gbif-zip': {
      const key = source.download?.key;
      const menu = [removeOccurrences(busy)];
      if (source.provenance) {
        menu.unshift(action('edit', 'Edit query', 'Open Search GBIF & OBIS with the query this download was cleaned with'));
      }
      return {
        ...base,
        title: key ? `GBIF download ${key}` : source.file.name,
        kindLabel: 'GBIF download',
        stats: recordStats(counts, source.provenance ? undefined : 'as downloaded'),
        primary: [CITE('this GBIF download')],
        menu,
        removePrompt,
      };
    }
    case 'file':
      return {
        ...base,
        title: source.files[0]?.name ?? source.label,
        kindLabel: 'File',
        stats: recordStats(counts),
        notes: ['Cite the original source of this file'],
        primary: [action('replace', 'Replace', 'Open Upload to load other files in place of this one')],
        menu: [removeOccurrences(busy)],
        removePrompt,
      };
    case 'example':
      return {
        ...base,
        title: source.label,
        kindLabel: 'Example',
        stats: recordStats(counts),
        notes: source.citation ? [] : [EXAMPLE_CITATION_PLACEHOLDER],
        primary: [
          action('examples', 'Examples', 'Open the Examples tab to load another example'),
          ...(source.citation ? [CITE('this example')] : []),
        ],
        menu: [removeOccurrences(busy)],
        removePrompt,
      };
  }
}

export function treeTitle(tree: TreeSource): string {
  switch (tree.kind) {
    case 'opentree': {
      const c = tree.candidate;
      if (c.kind === 'synthetic') return `Open Tree synthetic tree${c.synthVersion ? ` v${c.synthVersion}` : ''}`;
      return c.year != null ? `${c.title} (${c.year})` : c.title;
    }
    case 'file':
      return tree.file.name;
    case 'example':
      return /\btree$/i.test(tree.label) ? tree.label : `${tree.label} tree`;
  }
}

/** Below this share of dataset species in the tree, the tree card warns (§9.2). */
export const FEW_IN_TREE = 0.5;

function treeCard(tree: TreeSource, input: SourceCardsInput, busy: boolean): SourceCardModel {
  const { overlap } = input;
  const tips = `${fmtInt(tree.tips)} tips`;
  const stats =
    overlap && overlap.datasetSpecies > 0
      ? [`${tips} · ${fmtInt(overlap.inTree)} of ${fmtInt(overlap.datasetSpecies)} dataset species in tree`]
      : [tips];
  const few = overlap != null && overlap.datasetSpecies > 0 && overlap.inTree / overlap.datasetSpecies < FEW_IN_TREE;
  const citable = tree.kind === 'opentree' || (tree.kind === 'example' && !!tree.citation);
  return {
    key: tree.id,
    role: 'tree',
    title: treeTitle(tree),
    kindLabel: tree.kind === 'opentree' ? 'Open Tree of Life' : tree.kind === 'file' ? 'Tree file' : 'Example tree',
    stats,
    badges:
      tree.kind === 'opentree' && tree.grafen
        ? [{ text: 'Topology only', tooltip: "Branch lengths were set with Grafen's method" }]
        : [],
    ...(few ? { status: { tone: 'warning' as const, text: 'Few dataset species are in this tree' } } : {}),
    notes: input.includeTree ? [] : ['Not used in the analysis (Include tree is off)'],
    primary: [
      action('change', 'Change', 'Open the Phylogeny tab to pick or upload another tree'),
      ...(citable ? [CITE('this tree')] : []),
    ],
    menu: [action('remove', 'Remove', 'Remove the tree; bioregions are recomputed without it', busy ? BUSY : undefined)],
    removePrompt: 'Remove the tree?',
  };
}

/** The sidebar cards, in order: occurrence job row, occurrence card, tree job row, tree card. */
export function sourceCards(input: SourceCardsInput): SourceCardModel[] {
  const { sources, job, treeJob, counts } = input;
  const occurrence = (sources.find((s) => s.role === 'occurrences') as OccurrenceSource | undefined) ?? null;
  const tree = (sources.find((s) => s.role === 'tree') as TreeSource | undefined) ?? null;
  const running = isRunning(job) ? job : null;
  const busy = running != null || input.loading;
  const cards: SourceCardModel[] = [];

  // After the commit the new source carries the progress (status 'loading'); before it, and
  // during a Continue (whose source stays 'done'), a job row sits above the old card.
  const onCard = running != null && occurrence?.status === 'loading';
  if (running && !onCard) {
    const { primary, openTab } = jobActions(running);
    cards.push({
      key: running.id,
      role: 'job',
      title: `Loading ${keepRangesTogether(running.label)}`,
      kindLabel: running.kind === 'continue' ? 'Continuing' : 'Loading',
      stats: [],
      badges: [],
      notes: [],
      progress: jobProgress(running, counts),
      primary,
      menu: [],
      ...(primary.some((a) => a.id === 'stop')
        ? { stopOptions: stopOptions(running, counts, running.targetId != null) }
        : {}),
      ...(openTab ? { openTab } : {}),
    });
  }
  if (occurrence) {
    if (onCard && running) {
      const card = occurrenceCard(occurrence, input, true);
      const { primary, openTab } = jobActions(running);
      cards.push({
        ...card,
        status: { tone: 'info', text: `Loading ${keepRangesTogether(running.label)}` },
        progress: jobProgress(running, counts),
        primary,
        menu: [],
        ...(primary.some((a) => a.id === 'stop')
          ? { stopOptions: stopOptions(running, counts, running.targetId != null) }
          : {}),
        ...(openTab ? { openTab } : {}),
      });
    } else {
      const card = occurrenceCard(occurrence, input, busy);
      if (input.noCellsCapacity != null) card.notes = [...card.notes, tooFewRecordsHint(input.noCellsCapacity)];
      cards.push(card);
    }
  }

  if (treeJob?.state === 'loading') {
    cards.push({
      key: 'tree-job',
      role: 'job',
      title: `Loading ${treeJob.label}`,
      kindLabel: 'Tree',
      stats: [],
      badges: [],
      notes: [],
      progress: { value: null, max: null, text: 'Reading the tree…' },
      primary: [],
      menu: [],
    });
  } else if (treeJob?.state === 'error') {
    cards.push({
      key: 'tree-error',
      role: 'job',
      title: treeJob.label,
      kindLabel: 'Tree',
      stats: [],
      badges: [],
      status: { tone: 'error', text: `Tree not loaded: ${treeJob.error ?? 'unknown error'}` },
      notes: [],
      primary: [action('change', 'Change', 'Open the Phylogeny tab to pick or upload another tree')],
      menu: [],
    });
  }
  if (tree) cards.push(treeCard(tree, input, busy));
  return cards;
}
