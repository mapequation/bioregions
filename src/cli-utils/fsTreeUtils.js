import sentenceCase from 'sentence-case';
import _ from 'lodash';
import { parseTree, printTree } from '../client/utils/phylogeny';
import phyloUtils from '../client/utils/phylogeny/phyloUtils';
import treeUtils from '../client/utils/treeUtils';
import { readFile, promiseWriteStream } from './fsUtils';
import { getSpeciesCounts } from './fsSpeciesGeoUtils';

function readTree(path) {
  return readFile(path, 'utf8')
    .then(parseTree);
}

export function countNodes(treePath) {
  return readTree(treePath)
    .then(tree => {
      let numNodes = 0;
      let numLeafNodes = 0;
      treeUtils.visitTreeDepthFirst(tree, (node) => {
        ++numNodes;
        if (!node.children)
          ++numLeafNodes;
      })
      // console.log(`Num nodes: ${numNodes}\nNum leaf nodes: ${numLeafNodes}`);
      return { numNodes, numLeafNodes };
    });
}

export function printNames(treePath, outputPath) {
  return Promise.all([
    readTree(treePath),
    promiseWriteStream(outputPath),
  ])
  .then(([tree, out]) => new Promise((resolve, reject) => {
    out.on('finish', resolve);
    out.on('error', reject);
    treeUtils.visitLeafNodes(tree, node => {
      out.write(node.name + '\n');
    });
    out.end();
  }));
}

export function countIntersection(treePath, speciesPath, nameColumn) {
  return Promise.all([
    readTree(treePath),
    getSpeciesCounts(speciesPath, nameColumn),
  ])
  .then(([tree, species]) => {
    const leafNodes = treeUtils.getLeafNodes(tree);
    console.log(`Intersecting ${leafNodes.length} leaf nodes with ${species.uniqueCount} species on name...`);
    const sizeIntersection = leafNodes.reduce((sum, {name}) => {
      return sum + (species.speciesCounts[sentenceCase(name)] ? 1 : 0);
    }, 0);
    console.log(`${sizeIntersection} / ${leafNodes.length} intersecting species`);
    return sizeIntersection;
  });
}

export function printIntersection(treePath, speciesPath, nameColumn, outputPath) {
  return Promise.all([
    readTree(treePath),
    getSpeciesCounts(speciesPath, nameColumn),
    promiseWriteStream(outputPath),
  ])
  .then(([tree, species, out]) => new Promise((resolve, reject) => {
      const getLeafCount = ({name}) => species.speciesCounts[sentenceCase(name)] || 0;
      console.log('Aggregating intersection counts...');
      phyloUtils.aggregateCount(tree, getLeafCount);
      console.log('Pruning...');
      const prunedTree = phyloUtils.prune(tree, ({count}) => count > 0);
      console.log('Printing newick...');
      const prunedNewick = printTree(prunedTree);
      console.log('Writing to file...');
      out.on('finish', resolve);
      out.on('error', reject);
      out.write(prunedNewick);
      out.write('\n');
      out.end();
      console.log('Done!');
  }));
}

export default {
  countNodes,
  printNames,
  countIntersection,
  printIntersection,
};