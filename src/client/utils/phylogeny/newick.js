import treeUtils from '../treeUtils';

/**
 * Newick format parser in JavaScript.
 *
 * Copyright (c) Jason Davies 2010.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 * Example tree (from http://en.wikipedia.org/wiki/Newick_format):
 *
 * +--0.1--A
 * F-----0.2-----B            +-------0.3----C
 * +------------------0.5-----E
 *                            +---------0.4------D
 *
 * Newick format:
 * (A:0.1,B:0.2,(C:0.3,D:0.4)E:0.5)F;
 *
 * Converted to JSON:
 * {
 *   name: "F",
 *   children: [
 *     {name: "A", length: 0.1},
 *     {name: "B", length: 0.2},
 *     {
 *       name: "E",
 *       length: 0.5,
 *       children: [
 *         {name: "C", length: 0.3},
 *         {name: "D", length: 0.4}
 *       ]
 *     }
 *   ]
 * }
 *
 * Converted to JSON, but with no names or lengths:
 * {
 *   children: [
 *     {}, {}, {
 *       children: [{}, {}]
 *     }
 *   ]
 * }
 */

/**
 * Raw Newick parser, exported for testing
 */
export function _parseNewick(content) {
  let ancestors = [];
  let tree = {};
  let subtree = {};
  let readData = false;
  const contentLength = content.length;

  for (let i = 0; i < contentLength; ++i) {
      const char = content[i];
      switch (char) {
        case '(': // new children
        subtree = {};
        tree.children = [subtree];
        ancestors.push(tree);
        tree = subtree;
        break;
      case ',': // another branch
        subtree = {};
        ancestors[ancestors.length - 1].children.push(subtree);
        tree = subtree;
        break;
      case ')': // optional name next
        tree = ancestors.pop();
        break;
      case ';': // end of newick string
        break;
      case ':': // optional length next
        break;
      case '[': // optional data next
        readData = true;
        break;
      case '&': // optional data next
      case ']': // end of data
        break;
      default:
        const lastChar = content[i - 1];
        
        let j = i;
        let token = [];
        let ch = content[j]
        while (ch !== '(' &&
            ch !== ')' &&
            (ch !== ',' || readData === true) &&
            ch !== ':' &&
            ch !== ';' &&
            ch !== '[' &&
            ch !== ']') {
            token.push(ch);
            ++j;
            if (j === contentLength) {
              break;
            }
            ch = content[j];
        }
        i = j - 1;
        token = token.join('');
        readData = false;
        
        if (lastChar === ')' || lastChar === '(' || lastChar === ',') {
          tree.name = token;
        } else if (lastChar === ':') {
          tree.length = parseFloat(token);
        } else if (lastChar === '&' || lastChar === '[') {
          const data = token.split('&');
          data.forEach(entry => {
            const [key, val] = entry.split('=');
            if (key === 'area_pp') { // {0,1,.42,...}
              tree[key] = val.slice(1, -1)
                .split(',').map(v => parseFloat(v));
            }
            else {
              tree[key] = val;
            }
          })
        }
      }
  }
  
  return tree;
}

/**
 * Parse newick tree
 * @return Promise -> tree
 */
export function parseNewick(s) {
  return new Promise((resolve) => {
    const tree = _parseNewick(s);
    resolve(tree);
  });
}


const defaultOpts = {
  getName: (node) => node.name,
  getBranchLength: (node) => node.length,
}

/**
 * Write tree to newick formatted string.
 * @param [opts]: Object Optional object with getters getName and getBranchLength
 * @param root:Object The tree
 */
export function writeNewick(opts, root) {
  if (root === undefined) {
    root = opts;
    opts = defaultOpts;
  }
  else {
    opts = Object.assign({}, defaultOpts, opts);
  }
	function nested(nest) {
		let subtree = '';
		if(nest.children) {
			let children = [];
			nest.children.forEach(function(child) {
				let subsubtree = nested(child);
				children.push(subsubtree);
			});
      subtree = '(' + children.join() + ')';
      const name = opts.getName(nest);
      if (name !== undefined) {
        subtree = subtree + name;
      }
      const branchLength = opts.getBranchLength(nest);
      if (branchLength !== undefined) {
        subtree = subtree + ':' + branchLength;
      }
		}
		else {
      let leaf = "";
      const name = opts.getName(nest);
      if (name !== undefined) {
        leaf = name;
      }
      const branchLength = opts.getBranchLength(nest);
      if (branchLength !== undefined) {
        leaf = leaf + ':' + branchLength;
      }
      subtree = subtree + leaf;
		}
		return subtree;
	}
	return nested(root) + ';';
};


export default {
  parse: parseNewick,
  write: writeNewick,
};