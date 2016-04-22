import sentenceCase from 'sentence-case';

export function normalizeSpeciesName(speciesName) {
    if (!speciesName)
        return speciesName;
    const name = sentenceCase(speciesName);
    return `${name[0].toUpperCase()}${name.substr(1)}`;
}