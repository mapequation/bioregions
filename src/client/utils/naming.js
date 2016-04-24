// import sentenceCase from 'sentence-case';

export function normalizeSpeciesName(speciesName) {
    if (!speciesName)
        return speciesName;
    return _.upperFirst(speciesName.replace('_', ' '));
}