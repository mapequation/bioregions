import { parseNexus } from './nexus';
import { parseNewick, writeNewick } from './newick';
import { visitTreeDepthFirst } from '../treeUtils';

export { writeNewick as printTree };

export function parseTree(str) {

  let promise = new Promise(function(resolve, reject) {

    // console.log("Try parse tree...");
    str = str.trim();
    if (!str)
      return reject("No content in tree file")

    if (str.charAt(0) === '(') { // If newick format
      // console.log("Parse Newick...");
      const tree = parseNewick(str);
      return resolve(tree);
    }

    // console.log("Parse Nexus...");
    if (str.substr(0, 6).toLowerCase() === '#nexus') { // If nexus format
      let nexus = parseNexus(str);
      if (nexus.error) {
        return reject(`Can't parse nexus tree: ${nexus.error}`);
      }

      if (nexus.treesblock.trees.length == 0)
        return reject("No trees in nexus file.");

      // console.log("Nexus tree parsed successfully:", nexus);
      const {label, newick} = nexus.treesblock.trees[0];
      const {translate} = nexus.treesblock;
      console.log('Nexus:', nexus);

      let tree = parseNewick(newick);

      if (translate) {
        visitTreeDepthFirst(tree, node => {
          node.name = translate[node.name] || node.name;
        });
      }

      return resolve(tree);
    }

    return reject(`Can't recognize a valid tree format for the file beginning with "${str.substr(0,20)}"...`);
  });

  return promise.catch(function(error) {
    console.log('Error parsing tree:', error);
    throw(new Error(`Error parsing tree: ${error.message || error}.`));
  });
}
