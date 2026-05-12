/**
 * Newick format parser in TypeScript based on the Javascript library written by Miguel Pignatelli 2014, based on Jason Davies 2010.
 *
 * The Javascript version has a Copyright (c) edited by Miguel Pignatelli 2014, based on Jason Davies 2010.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the 'Software'), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
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
 *   name: 'F',
 *   children: [
 *     {name: 'A', branchLength: 0.1},
 *     {name: 'B', branchLength: 0.2},
 *     {
 *       name: 'E',
 *       length: 0.5,
 *       children: [
 *         {name: 'C', branchLength: 0.3},
 *         {name: 'D', branchLength: 0.4}
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

const regMatchQuoted = new RegExp(/[['"]*['"]([^']+?)'/g);

export interface ITree {
  name: string;
  branchLength: number | null;
  bs?: number;
  children: ITree[];
}

function makeid(length: number): string {
  let result = '';
  const characters =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

function read(newickString: string) {
  const emptyAncestor: ITree = {
    branchLength: null,
    children: [],
    name: '',
  };
  const ancestors: ITree[] = [emptyAncestor];
  let tree: ITree = {
    branchLength: null,
    children: [],
    name: '',
  };

  const testString = newickString.split('(');

  const exceptionHashTable: { [name: string]: string } = {};
  const parts = testString.length;
  for (let i = 0; i < parts; i++) {
    let copyNewickString = testString[i];

    while (copyNewickString.match(regMatchQuoted)) {
      const matches = copyNewickString.match(regMatchQuoted);
      if (matches) {
        const id = makeid(10);
        exceptionHashTable[id] = matches[0].replace(/'/g, '');
        copyNewickString = copyNewickString.replace(matches[0], id);
      }
    }
    testString[i] = copyNewickString;
  }
  const fullString = testString.join('(');
  const tokens = fullString.split(/\s*(;|\(|\)|,|:)\s*/);
  for (let i = 0; i < tokens.length; i++) {
    const token: string = tokens[i];
    switch (token) {
      case '(':
        const newChildren: ITree = {
          branchLength: null,
          children: [],
          name: '',
        };
        tree.children = [newChildren];
        ancestors.push(tree);
        tree = newChildren;
        break;
      case ',':
        const anotherBranch: ITree = {
          branchLength: null,
          children: [],
          name: '',
        };
        const children = ancestors[ancestors.length - 1].children;
        if (children) {
          children.push(anotherBranch);
          tree = anotherBranch;
        }
        break;
      case ')': // optional name next
        const lastAncestor = ancestors.pop();
        if (lastAncestor) {
          tree = lastAncestor;
        }
        break;
      case ':': // optional length next
        break;
      default:
        const x: string = tokens[i - 1];
        if (x === ')' || x === '(' || x === ',') {
          if (exceptionHashTable.hasOwnProperty(token)) {
            const [str1, str2] = exceptionHashTable[token].split(':');
            if (str2) {
              tree.name = str2;
              tree.bs = parseFloat(str1);
            } else {
              tree.name = '';
              tree.bs = parseFloat(str1);
            }
          } else {
            if (token.match(/[a-zA-Z]/)) {
              tree.name = token;
            } else {
              tree.name = '';
              if (!isNaN(parseFloat(token))) {
                tree.bs = parseFloat(token);
              }
            }
          }
          if (tree.name === 'NA') {
            tree.name = '';
          }
        } else if (x === ':') {
          tree.branchLength = parseFloat(token);
        }
    }
  }
  return tree;
}

function write(json: ITree) {
  function nested(nest: ITree) {
    let subtree: string = '';
    if (nest.children.length) {
      const newChildren: string[] = [];
      const nestedChildren = nest.children;
      if (nestedChildren) {
        nestedChildren.forEach((child) => {
          const subsubtree = nested(child);
          newChildren.push(subsubtree);
        });
      }
      const substring = newChildren.join();
      if (nest.hasOwnProperty('name')) {
        subtree = '(' + substring + ')' + nest.name;
      }
      if (nest.hasOwnProperty('branchLength')) {
        if (nest.branchLength) {
          subtree = subtree + ':' + nest.branchLength;
        }
      }
    } else {
      let leaf: string = '';
      if (nest.hasOwnProperty('name') && nest.name) {
        leaf = nest.name;
      }
      if (nest.hasOwnProperty('branchLength') && nest.branchLength) {
        leaf = `${leaf}:${nest.branchLength}`;
      }
      subtree = subtree + leaf;
    }
    return subtree;
  }
  return `${nested(json)};`;
}

export { read, write };
