export interface ColumnNames {
  name: string;
  lat: string;
  long: string;
}

const RE_NAME = /species|binomial|name/i;
const RE_LAT = /lat/i;
const RE_LONG = /lng|long/i;

/**
 * Guesses the species, latitude and longitude columns of a point file from its header:
 * the first column whose name contains species/binomial/name, lat, and lng/long. A role
 * with no match falls back to the first column not already taken, in order, so a
 * header with no recognisable names maps to columns 0, 1 and 2 (as Load.tsx did) and
 * no column is picked twice.
 */
export function guessColumnNames(cols: string[]): ColumnNames {
  let name = '';
  let lat = '';
  let long = '';
  for (const col of cols) {
    if (!name && RE_NAME.test(col)) {
      name = col;
      continue;
    }
    if (!lat && RE_LAT.test(col)) {
      lat = col;
      continue;
    }
    if (!long && RE_LONG.test(col)) {
      long = col;
    }
  }
  const taken = new Set([name, lat, long].filter(Boolean));
  const next = () => {
    const col = cols.find((c) => !taken.has(c)) ?? '';
    taken.add(col);
    return col;
  };
  if (name === '') name = next();
  if (lat === '') lat = next();
  if (long === '') long = next();
  return { name, lat, long };
}
