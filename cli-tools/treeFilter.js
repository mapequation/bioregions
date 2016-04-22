import fsp from 'fs-promise';
import { parseTree } from '../js/utils/phylogeny';
import treeUtils from '../js/utils/treeUtils';
import tabularStream from 'tabular-stream';
import sentenceCase from 'sentence-case';
import es from 'event-stream';
import _ from 'lodash';

function readFile(path, enc) {
  return fsp.realpath(path)
    .then(resolvedPath => {
      console.log(`Read file ${resolvedPath}...`);
      return fsp.readFile(resolvedPath, enc);
    })
}

function readTree(path) {
  return readFile(path, 'utf8')
    .then(parseTree)
}

function promiseWriteStream(path) {
  return new Promise((resolve, reject) => {
    let out = fsp.createWriteStream(path);
    // out.on('finished', resolve);
    out.on('error', reject);
    out.on('open', () => {
      resolve(out);
    })
  });

}

export function countNodes(treePath) {
  let numLeafNodes = 0;
  let numNodes = 0;
  function countLeafNodes(node) {
    ++numNodes;
    if (node.children) {
      for (var i=0; i < node.children.length; i++) {
        countLeafNodes(node.children[i])
      }
    }
    else
      ++numLeafNodes;
  }
  return readTree(treePath)
    .then(tree => {
      console.log(`Count nodes...`);
      countLeafNodes(tree);
      console.log(`Num nodes: ${numNodes}, num leaf nodes: ${numLeafNodes}.`);
      return numLeafNodes;
    });
}

export function printNames(treePath, outputPath) {
  return new Promise((resolve, reject) => {
    let out = fsp.createWriteStream(outputPath);
    out.on('finished', resolve);
    out.on('error', reject);
    out.on('open', () => {
      readTree(treePath)
        .then(tree => {
          console.log("Visit tree...");
          treeUtils.visitTreeDepthFirst(tree, node => {
            if (!node.children)
              out.write(node.name + '\n');
          });
          return;
        })
        .then(() => {
          console.log(`Closing ${outputPath}...`);
          out.end()
        });
      })
  });
}

function getSpecies(speciesPath, nameColumn) {
  return new Promise((resolve, reject) => {
    let species = {};
    let count = 0;
    let countUnique = 0;
    console.log(`Reading species from ${speciesPath} on column ${nameColumn}...`);
    fsp.createReadStream(speciesPath)
      .pipe(tabularStream())
      .pipe(es.map((data, cb) => {
        ++count;
        // if (count < 5)
        //   console.log(`${count}: ${JSON.stringify(data)} -> (${nameColumn}) ->  ${sentenceCase(data[nameColumn])}`);
        const name = sentenceCase(data[nameColumn]);
        if (!species[name]) {
          species[name] = 0;
          ++countUnique;
        }
        ++species[name];
        cb(null, data);
      }))
      .on('error', reject)
      .on('end', () => {
        console.log(`Collected ${countUnique} unique species from ${count} records.`);
        resolve(species);
      });
  });
}

export function intersection(treePath, speciesPath, nameColumn, outputPath) {
  return Promise.all([
    readTree(treePath),
    getSpecies(speciesPath, nameColumn),
    promiseWriteStream(outputPath)
  ])
  .then(([tree, species, out]) => {
    const leafNodes = treeUtils.filterDepthFirst(tree, node => {
      node.count = 0; // Reset count
      return !node.children;
    });
    // let leafNodes = treeUtils.getLeafNodes(tree);
    console.log(`Intersecting ${leafNodes.length} leaf nodes on name...`);
    const sizeIntersection = leafNodes.reduce((sum, {name}) => {
      return sum + (species[sentenceCase(name)] ? 1 : 0);
    }, 0);
    console.log(`${sizeIntersection} / ${leafNodes.length} intersecting species`);
    return sizeIntersection;
  });
}



// fs.readFileSync()

// parseTree(treeString).then(tree => {
//   console.log("tree:", tree);
// });
