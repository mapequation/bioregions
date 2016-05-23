import nexus from './nexus';
import newick, { writeNewick } from './newick';
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
      const tree = newick.parse(str);
      return resolve(tree);
    }

    // console.log("Parse Nexus...");
    if (str.substr(0, 6).toLowerCase() === '#nexus') { // If nexus format
      const tree = nexus.parse(str);
      return resolve(tree);
    }

    return reject(`Can't recognize a valid tree format for the file beginning with "${str.substr(0,20)}"...`);
  });

  return promise.catch(function(error) {
    console.log('Error parsing tree:', error);
    throw(new Error(`Error parsing tree: ${error.message || error}.`));
  });
}
