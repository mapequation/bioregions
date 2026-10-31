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

// Hoisted reference to Object.prototype.hasOwnProperty so call sites read it via
// `.call` without accessing the prototype builtin on the target object directly
// (Object.hasOwn is ES2022; this lib targets ES2020).
const hasOwn = Object.prototype.hasOwnProperty;

export interface ITree {
  name: string;
  branchLength: number | null;
  bs?: number;
  children: ITree[];
}

type Token =
  | { kind: 'punct'; value: string; pos: number }
  | { kind: 'label'; value: string; quoted: boolean; pos: number };

const PUNCT = '(),:;';
const BARE_END = '(),:;[\'"';

function* tokenize(text: string): Generator<Token> {
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '[') {
      // Comment, e.g. BEAST/FigTree annotations `[&rate=1]`
      const end = text.indexOf(']', i + 1);
      if (end === -1) {
        throw new Error(`Newick: unclosed comment at character ${i}`);
      }
      i = end + 1;
    } else if (PUNCT.includes(c)) {
      yield { kind: 'punct', value: c, pos: i };
      i++;
    } else if (c === "'" || c === '"') {
      // Quoted label; in single quotes, '' is an escaped quote
      let value = '';
      let j = i + 1;
      for (;;) {
        if (j >= text.length) {
          throw new Error(`Newick: unclosed quote at character ${i}`);
        }
        if (text[j] === c) {
          if (c === "'" && text[j + 1] === "'") {
            value += "'";
            j += 2;
            continue;
          }
          break;
        }
        value += text[j++];
      }
      yield { kind: 'label', value, quoted: true, pos: i };
      i = j + 1;
    } else if (/\s/.test(c)) {
      i++;
    } else {
      let j = i + 1;
      while (j < text.length && !BARE_END.includes(text[j])) {
        j++;
      }
      yield {
        kind: 'label',
        value: text.slice(i, j).trim(),
        quoted: false,
        pos: i,
      };
      i = j;
    }
  }
}

function setLabel(
  node: ITree,
  label: string,
  quoted: boolean,
  internal: boolean,
) {
  // Tip labels are always names. An unquoted numeric internal label is a
  // support value (bootstrap/posterior), and 'NA' means no label.
  if (internal && !quoted) {
    if (label === 'NA') {
      return;
    }
    const support = Number(label);
    if (Number.isFinite(support)) {
      node.bs = support;
      return;
    }
  }
  node.name = label;
}

/**
 * Parse the first tree in a Newick string. Anything after the first `;` is
 * ignored, and `[...]` comments are skipped. Missing branch lengths are `null`.
 * Throws on unbalanced parentheses and misplaced tokens.
 */
function read(newickString: string): ITree {
  const newNode = (): ITree => ({ branchLength: null, children: [], name: '' });
  const tree = newNode();
  const ancestors: ITree[] = [];
  let node = tree;
  // 'start': node just opened; 'closed': after its ')'; 'labelled'; 'done': after its length
  let state: 'start' | 'closed' | 'labelled' | 'done' = 'start';
  let wantLength = false;

  for (const token of tokenize(newickString)) {
    const at = `at character ${token.pos}`;
    if (wantLength) {
      const length = token.kind === 'label' ? Number(token.value) : Number.NaN;
      if (token.kind !== 'label' || token.quoted || !Number.isFinite(length)) {
        throw new Error(`Newick: expected a branch length ${at}`);
      }
      node.branchLength = length;
      wantLength = false;
      state = 'done';
      continue;
    }
    if (token.kind === 'label') {
      if (state !== 'start' && state !== 'closed') {
        throw new Error(`Newick: unexpected label ${at}`);
      }
      setLabel(node, token.value, token.quoted, state === 'closed');
      state = 'labelled';
      continue;
    }
    if (token.value === ';') {
      break;
    }
    switch (token.value) {
      case '(': {
        if (state !== 'start') {
          throw new Error(`Newick: unexpected '(' ${at}`);
        }
        ancestors.push(node);
        node = newNode();
        ancestors[ancestors.length - 1].children.push(node);
        state = 'start';
        break;
      }
      case ',': {
        const parent = ancestors[ancestors.length - 1];
        if (!parent) {
          throw new Error(`Newick: ',' outside parentheses ${at}`);
        }
        node = newNode();
        parent.children.push(node);
        state = 'start';
        break;
      }
      case ')': {
        const parent = ancestors.pop();
        if (!parent) {
          throw new Error(`Newick: unbalanced ')' ${at}`);
        }
        node = parent;
        state = 'closed';
        break;
      }
      case ':': {
        if (state === 'done') {
          throw new Error(`Newick: second branch length ${at}`);
        }
        wantLength = true;
        break;
      }
    }
  }
  if (wantLength) {
    throw new Error('Newick: missing branch length at end of input');
  }
  if (ancestors.length > 0) {
    throw new Error("Newick: unbalanced '(' (missing ')')");
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
      if (hasOwn.call(nest, 'name')) {
        subtree = `(${substring})${nest.name}`;
      }
      if (hasOwn.call(nest, 'branchLength')) {
        if (nest.branchLength) {
          subtree = `${subtree}:${nest.branchLength}`;
        }
      }
    } else {
      let leaf: string = '';
      if (hasOwn.call(nest, 'name') && nest.name) {
        leaf = nest.name;
      }
      if (hasOwn.call(nest, 'branchLength') && nest.branchLength) {
        leaf = `${leaf}:${nest.branchLength}`;
      }
      subtree = subtree + leaf;
    }
    return subtree;
  }
  return `${nested(json)};`;
}

export { read, write };
