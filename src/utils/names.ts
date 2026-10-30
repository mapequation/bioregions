import _ from 'lodash';

export function normalizeSpeciesName(speciesName: string | number) {
  // Shapefile attribute tables can hold numeric names, e.g. species ids.
  const name =
    typeof speciesName === 'number' ? String(speciesName) : speciesName;
  if (!name || name.length === 1) return name;
  return _.upperFirst(name.replace(/[_.]/g, ' '));
}
