import { queryKey } from '@/sources/query';
import type { OccurrenceQuery } from '@/sources/types';
import type { DataLoadJob, StopState } from '@/store/data/types';
import { stopShort, stopSentence } from '@/store/explorer/provenance';
import type { PartialLoad } from '@/store/explorer/types';
import { fmtInt } from '../format';
import { EMPTY_REASON_SHORT, type EmptyReason } from '../preview/cleaningSteps';

/**
 * How a stopped load is incomplete: some species never arrived (species-by-species streams),
 * or every species arrived but later records did not (record-ordered streams).
 */
export type PartialKind = 'speciesMissing' | 'recordsTruncated';

type PartialLike = {
  kind?: PartialKind;
  speciesLoaded?: PartialLoad['speciesLoaded'] | null;
  speciesPlanned?: PartialLoad['speciesPlanned'];
};

/** The store's `kind` when it sets one, else inferred from the species counts. */
export function partialKindOf(p: PartialLike): PartialKind {
  if (p.kind === 'speciesMissing' || p.kind === 'recordsTruncated') return p.kind;
  return p.speciesPlanned != null && p.speciesLoaded != null && p.speciesLoaded < p.speciesPlanned
    ? 'speciesMissing'
    : 'recordsTruncated';
}

/**
 * Why the partial dataset is biased, in plain words for its kind, without assuming who
 * stopped it: "An incomplete load under-represents the species that had not arrived yet:
 * records arrive species by species, so 4 species are missing entirely." or "All 46 species
 * are present, but records that had not arrived yet are missing, so record counts per
 * species are not representative."
 */
export function partialExplanation(p: PartialLike): string {
  if (partialKindOf(p) === 'speciesMissing') {
    const missing =
      p.speciesPlanned != null && p.speciesLoaded != null ? Math.max(0, p.speciesPlanned - p.speciesLoaded) : null;
    const what =
      missing == null || missing === 0
        ? 'some species are'
        : missing === 1
          ? '1 species is'
          : `${fmtInt(missing)} species are`;
    return `An incomplete load under-represents the species that had not arrived yet: records arrive species by species, so ${what} missing entirely.`;
  }
  const all = p.speciesPlanned ?? p.speciesLoaded ?? 0;
  const species = all > 0 ? `All ${fmtInt(all)} ${all === 1 ? 'species is' : 'species are'}` : 'All species are';
  return `${species} present, but records that had not arrived yet are missing, so record counts per species are not representative.`;
}

/** What failed requests leave out (spec §4.4): gaps by area and year, not whole species. */
export const ERRORS_MISSING =
  'The failed requests each covered some species in some areas or years, so those records are missing and the data may have gaps in some regions.';

/** The banner's "what is missing" sentence for the stop reason. */
export function partialMissingText(stop: StopState | null | undefined, partial: PartialLike): string {
  return stop?.reason === 'errors' ? ERRORS_MISSING : partialExplanation(partial);
}

/** Label of the Continue action: "Continue up to 1,000,000" after a cap stop, else "Continue loading". */
export function continueLabel(stop: StopState | null | undefined, continueCap: number | null): string {
  return stop?.reason === 'cap' && continueCap != null ? `Continue up to ${fmtInt(continueCap)}` : 'Continue loading';
}

/** Tooltip of the Continue action: what it fetches and where the records go. */
export function continueTip(stop: StopState | null | undefined, continueCap: number | null): string {
  return stop?.reason === 'cap' && continueCap != null
    ? `Raise the cap to ${fmtInt(continueCap)} and fetch the records past the old cap, adding them to this dataset`
    : 'Fetch only the records that did not arrive and add them to this dataset';
}

export const LOAD_AGAIN_TIP =
  'Run this query again from the start. The new records replace the loaded ones once the first arrives; if none arrive, the loaded data stays.';
export const TRY_AGAIN_TIP = 'Run the same load again';

/** The banner's closing line: what the two actions do. */
export function nextStepText(stop: StopState | null | undefined, continueCap: number | null): string {
  if (stop?.reason === 'cap' && continueCap != null) {
    return `Continue raises the cap to ${fmtInt(continueCap)} and fetches the rest. Load again starts over.`;
  }
  return 'Continue loading fetches only what is missing and adds it to this dataset. Load again starts over.';
}

/** "Loaded 40,033 of ~412,380 records · 38 of 40 species (partial)". */
export function partialTitle(p: Pick<PartialLoad, 'accepted' | 'planned'> & PartialLike, stop?: StopState | null): string {
  // After a cap stop the plan under-estimated, so "of ~planned" would understate what exists.
  const records =
    stop?.reason === 'cap' || p.planned <= 0
      ? `${fmtInt(p.accepted)} records`
      : `${fmtInt(p.accepted)} of ~${fmtInt(p.planned)} records`;
  const species =
    p.speciesLoaded != null && p.speciesPlanned != null && p.speciesPlanned > 0
      ? ` · ${fmtInt(p.speciesLoaded)} of ${fmtInt(p.speciesPlanned)} species`
      : '';
  return `Loaded ${records}${species} (partial)`;
}

/** The banner's "why it stopped" sentence (spec §4.4); null for a partial load without a stop. */
export function stopReasonText(stop: StopState | null | undefined, cap: number | undefined): string | null {
  return stop ? stopSentence(stop, cap ?? 0) : null;
}

const SOURCE_SHORT: Record<string, string> = { gbif: 'GBIF', obis: 'OBIS' };

function sourceNames(ids: readonly string[]): string {
  const names = ids.map((id) => SOURCE_SHORT[id] ?? id);
  if (names.length === 0) return 'The data sources';
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * The dock's one-line status after a load of the current query (spec §4.4 DoneRow):
 * a bold title and the parts after it, joined by " · ".
 */
export function doneRowText(load: {
  accepted: number;
  species?: number | null;
  partial?: Pick<PartialLoad, 'accepted' | 'planned'> | null;
  stop?: StopState | null;
}): { title: string; parts: string[] } {
  const { accepted, species, partial, stop } = load;
  if (stop?.reason === 'cap') {
    const estimate = stop.estimate != null ? `; the estimate was ~${fmtInt(stop.estimate)}, so` : ', so';
    return {
      title: `Loaded ${fmtInt(accepted)} records`,
      parts: [`${sourceNames(stop.sources)} stopped at the cap${estimate} more may exist`],
    };
  }
  if (partial || stop) {
    const title =
      partial && partial.planned > 0
        ? `Loaded ${fmtInt(partial.accepted)} of ~${fmtInt(partial.planned)} records`
        : `Loaded ${fmtInt(accepted)} records`;
    return { title, parts: ['partial', ...(stop ? [stopShort(stop)] : [])] };
  }
  return { title: `Loaded ${fmtInt(accepted)} records`, parts: species != null ? [`${fmtInt(species)} species`] : [] };
}

/**
 * The outcome of a load that kept nothing, when it was a query load of `query` and has
 * ended: the dock and the loaded panel show it for the job's query only (spec §4.4).
 */
export function emptyOutcomeFor(
  job: DataLoadJob | null | undefined,
  query: OccurrenceQuery,
): NonNullable<DataLoadJob['outcome']> | null {
  if (!job?.outcome || job.kind !== 'query' || !job.request) return null;
  if (job.state === 'planning' || job.state === 'streaming' || job.state === 'finishing') return null;
  return queryKey(job.request.query) === queryKey(query) ? job.outcome : null;
}

export const EMPTY_ROW_TITLE = 'Nothing loaded';
/** Shown instead of a button when the same query would give the same empty result. */
export const CHANGE_QUERY_HINT = 'Change the query to load records';

/** Why an empty load kept nothing, for one-line rows: the error itself when the requests failed. */
export function emptyRowReason(reason: EmptyReason, lastError?: string | null): string {
  if (reason === 'failed') return lastError || EMPTY_REASON_SHORT.failed;
  if (reason === 'cancelledEarly') return 'stopped before any record arrived';
  return EMPTY_REASON_SHORT[reason];
}

/** The action an empty load offers (spec §4.4): Try again, Load again (both rerun it), or none. */
export function emptyAction(reason: EmptyReason): 'tryAgain' | 'loadAgain' | null {
  if (reason === 'failed') return 'tryAgain';
  if (reason === 'cancelledEarly') return 'loadAgain';
  return null;
}
