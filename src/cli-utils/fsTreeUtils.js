import _ from 'lodash';
import { parseTree, printTree } from '../client/utils/phylogeny';
import treeUtils from '../client/utils/treeUtils';
import { readFile, promiseWriteStream } from './fsUtils';
import fsp from 'fs-promise';
import tabularStream from 'tabular-stream';
import es from 'event-stream';
import { getSpeciesCounts } from './fsSpeciesGeoUtils';
import { normalizeSpeciesName } from '../client/utils/naming';

export function readTree(path) {
  return readFile(path, 'utf8')
    .then(parseTree);
}

export function countNodes(treePath) {
  return readTree(treePath)
    .then(tree => {
      let numTreeNodes = 0;
      let numTreeSpecies = 0;
      treeUtils.visitTreeDepthFirst(tree, (node) => {
        ++numTreeNodes;
        if (!node.children)
          ++numTreeSpecies;
      })
      // console.log(`Num nodes: ${numNodes}\nNum leaf nodes: ${numLeafNodes}`);
      return { numTreeNodes, numTreeSpecies };
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
    // console.log(`Intersecting ${leafNodes.length} leaf nodes with ${species.uniqueCount} species on name...`);
    const sizeIntersection = leafNodes.reduce((sum, {name}) => {
      return sum + (species.speciesCounts[normalizeSpeciesName(name)] ? 1 : 0);
    }, 0);
    // console.log(`${sizeIntersection} / ${leafNodes.length} intersecting species`);
    return {
      numTreeSpecies: leafNodes.length,
      numGeoSpecies: species.uniqueCount,
      numCommonSpecies: sizeIntersection,
    };
  });
}

export function printIntersection(treePath, speciesPath, nameColumn, outputPath) {
  return Promise.all([
    readTree(treePath),
    getSpeciesCounts(speciesPath, nameColumn),
    promiseWriteStream(outputPath),
  ])
  .then(([tree, species, out]) => new Promise((resolve, reject) => {
      const getLeafCount = ({name}) => species.speciesCounts[normalizeSpeciesName(name)] || 0;
      // console.log('Aggregating intersection counts...');
      treeUtils.aggregateCount(tree, getLeafCount);
      // console.log('Pruning...');
      const prunedTree = treeUtils.prune(tree, ({count}) => count > 0);
      // console.log('Printing newick...');
      const prunedNewick = printTree(prunedTree);
      // console.log('Writing to file...');
      out.on('finish', resolve);
      out.on('error', reject);
      out.write(prunedNewick);
      out.write('\n');
      out.end();
      console.log('Done!');
  }));
}

export function printSpeciesDistributionIntersection(treePath, speciesPath, nameColumn, outputPath) {
  return Promise.all([
    readTree(treePath),
    promiseWriteStream(outputPath),
  ])
  .then(([tree, out]) => new Promise((resolve, reject) => {
      const treeSpecies = {};
      let numTreeSpecies = 0;
      treeUtils.visitLeafNodes(tree, node => {
        treeSpecies[normalizeSpeciesName(node.name)] = true;
        ++numTreeSpecies;
      });
      let numGeoSpecies = 0;
      let numFilteredGeoSpecies = 0;
      let isHeaderWritten = false;
      fsp.createReadStream(speciesPath)
        .pipe(tabularStream())
        .pipe(es.map((row, cb) => {
          const name = normalizeSpeciesName(row[nameColumn]);
          ++numGeoSpecies;
          if (!isHeaderWritten) {
            out.write(_.keys(row).join('\t') + '\n');
            isHeaderWritten = true;
          }
          if (!treeSpecies[name]) {
            cb(null, null);
          } else {
            cb(null, row);
            ++numFilteredGeoSpecies;
            out.write(_.values(row).join('\t') + '\n');
          }
        }))
        .on('error', reject)
        .on('end', () => {
          console.log('Read end!');
          out.end();
        });
      
      out
        .on('finish', () => {
          // console.log(`Collected ${countUnique} unique species from ${count} records.`);
          console.log('Out finish!');
          resolve({
              numTreeSpecies,
              numGeoSpecies,
              numFilteredGeoSpecies,
          });
        });
  }));
}

export function normalizeNames(treePath, outputPath) {
  return Promise.all([
    readTree(treePath),
    promiseWriteStream(outputPath),
  ])
  .then(([tree, out]) => new Promise((resolve, reject) => {
      treeUtils.normalizeNames(tree);
      const newickTree = printTree(tree);
      out.on('finish', resolve);
      out.on('error', reject);
      out.write(newickTree);
      out.write('\n');
      out.end();
      resolve(outputPath);
  }));
}

/**
 * Remove nodes with only one child
 */
export function simplifyTree(treePath, outputPath) {
  return Promise.all([
    readTree(treePath),
    promiseWriteStream(outputPath),
  ])
  .then(([tree, out]) => new Promise((resolve, reject) => {
      const newickTree = printTree(treeUtils.simplifyTree(tree));
      out.on('finish', resolve);
      out.on('error', reject);
      out.write(newickTree);
      out.write('\n');
      out.end();
      resolve(outputPath);
  }));
}

export default {
  readTree,
  countNodes,
  printNames,
  countIntersection,
  printIntersection,
  printSpeciesDistributionIntersection,
  normalizeNames,
  simplifyTree,
};