// import sentenceCase from 'sentence-case';
import _ from 'lodash';

export function normalizeSpeciesName(speciesName) {
    if (!speciesName || speciesName.length === 1)
        return speciesName;
    return _.upperFirst(speciesName.replace(/_/g, ' '));
    // return speciesName.toLowerCase().replace(/ /g, '_');
}