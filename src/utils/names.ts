import _ from 'lodash';

export function normalizeSpeciesName(speciesName: string) {
  if (!speciesName || speciesName.length === 1) return speciesName;
  return _.upperFirst(speciesName.replace(/[_\.]/g, ' '));
}
