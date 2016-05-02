// import sentenceCase from 'sentence-case';
import _ from 'lodash';

export function normalizeSpeciesName(speciesName) {
    if (!speciesName)
        return speciesName;
    return _.upperFirst(speciesName.replace(/_/g, ' '));
}