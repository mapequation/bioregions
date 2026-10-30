import { normalizeSpeciesName } from './names';

export interface OccurrenceColumns {
  nameColumn: string;
  longColumn: string;
  latColumn: string;
}

export interface Occurrence {
  name: string;
  coordinates: [longitude: number, latitude: number];
}

// Plain decimal numbers, as Papa's dynamic typing accepts them. Rejects hex,
// `Infinity` and empty strings, which `Number()` would turn into numbers.
const DECIMAL = /^\s*[-+]?(\d+\.?|\.\d+|\d+\.\d+)([eE][-+]?\d+)?\s*$/;

/**
 * A coordinate cell as a number, or `NaN` if it is not one. Cells are numbers
 * when parsed with Papa's `dynamicTyping`, and strings otherwise; an empty cell
 * (`null`) is `NaN`, not 0.
 */
export function parseCoordinate(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && DECIMAL.test(value)) {
    return Number.parseFloat(value);
  }
  return Number.NaN;
}

export function isValidCoordinate(longitude: number, latitude: number) {
  return (
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    Math.abs(longitude) <= 180 &&
    Math.abs(latitude) <= 90
  );
}

/**
 * One occurrence table row as a named point, or `null` if the row has no
 * species name or a missing, non-numeric or out-of-range coordinate.
 */
export function parseOccurrence(
  row: { [key: string]: unknown },
  { nameColumn, longColumn, latColumn }: OccurrenceColumns,
): Occurrence | null {
  const rawName = row[nameColumn];
  if (rawName === null || rawName === undefined) return null;
  const name = normalizeSpeciesName(`${rawName}`.trim());
  if (!name || name === 'NA') return null;

  const longitude = parseCoordinate(row[longColumn]);
  const latitude = parseCoordinate(row[latColumn]);
  if (!isValidCoordinate(longitude, latitude)) return null;

  return { name, coordinates: [longitude, latitude] };
}
