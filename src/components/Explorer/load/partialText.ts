import type { PartialLoad } from '@/store/explorer/types';
import { fmtInt } from '../format';

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
 * Why the partial dataset is biased, in plain words for its kind:
 * "A stopped load under-represents the species that had not streamed yet: records arrive
 * species by species, so 4 species are missing entirely." or
 * "All 46 species are present, but records that had not streamed yet are missing, so record
 * counts per species are not representative."
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
    return `A stopped load under-represents the species that had not streamed yet: records arrive species by species, so ${what} missing entirely.`;
  }
  const all = p.speciesPlanned ?? p.speciesLoaded ?? 0;
  const species = all > 0 ? `All ${fmtInt(all)} ${all === 1 ? 'species is' : 'species are'}` : 'All species are';
  return `${species} present, but records that had not streamed yet are missing, so record counts per species are not representative.`;
}
