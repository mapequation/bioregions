// Pure Newick helpers for phylogenies fetched from Open Tree of Life: a robust
// parser and writer plus the tree operations the phylogeny panel needs (relabel,
// prune, Grafen branch lengths, summary stats). Every traversal is iterative so
// deep caterpillar trees (tens of thousands of levels) cannot overflow the stack.
//
// Why not the app's reader (src/utils/tree/newick.ts)? It treats a quoted label as
// `'support:name'` and drops plain quoted names such as `'Homo sapiens'`, which is
// exactly how Open Tree study trees label their tips. This parser returns the same
// node shape (`ITree` without `bs`), and `writeNewick` writes labels the app reader
// understands (spaces as underscores, which `normalizeSpeciesName` turns back).

/** Same shape as the app reader's `ITree` (minus the optional support value). */
export interface NewickNode {
  name: string;
  branchLength: number | null;
  children: NewickNode[];
}

export interface TreeStats {
  tips: number;
  internalNodes: number;
  /** Internal nodes with more than two children. */
  polytomies: number;
  /** Share of internal nodes that are bifurcating (0 when there are none). */
  resolution: number;
  /** Every non-root node has a branch length. */
  hasBranchLengths: boolean;
  /** All root-to-tip lengths agree within a relative tolerance of 1e-6. */
  isUltrametric: boolean;
  /** Longest root-to-tip length, or null without branch lengths. */
  depth: number | null;
}

const node = (name = '', branchLength: number | null = null): NewickNode => ({
  name,
  branchLength,
  children: [],
});

/** Nodes in pre-order (parents before children, left to right). */
export function preOrder(tree: NewickNode): NewickNode[] {
  const order: NewickNode[] = [];
  const stack = [tree];
  while (stack.length > 0) {
    const current = stack.pop() as NewickNode;
    order.push(current);
    for (let i = current.children.length - 1; i >= 0; i--) {
      stack.push(current.children[i]);
    }
  }
  return order;
}

/** Tip labels left to right. */
export function tipLabels(tree: NewickNode): string[] {
  return preOrder(tree)
    .filter((n) => n.children.length === 0)
    .map((n) => n.name);
}

/**
 * Parse a Newick string. Handles quoted labels (with `''` escapes), `[comments]`,
 * whitespace and missing labels or lengths. Unquoted underscores are kept as is.
 */
export function parseNewick(newick: string): NewickNode {
  const root = node();
  const stack: NewickNode[] = [];
  let current = root;
  let expectLength = false;
  const n = newick.length;
  let i = 0;

  while (i < n) {
    const ch = newick[i];
    if (ch === ';') {
      break;
    }
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
    } else if (ch === '[') {
      const end = newick.indexOf(']', i + 1);
      i = end === -1 ? n : end + 1;
    } else if (ch === '(') {
      const child = node();
      current.children.push(child);
      stack.push(current);
      current = child;
      expectLength = false;
      i++;
    } else if (ch === ',') {
      const parent = stack[stack.length - 1];
      if (!parent) {
        throw new Error(`Invalid Newick: unexpected ',' at position ${i}`);
      }
      current = node();
      parent.children.push(current);
      expectLength = false;
      i++;
    } else if (ch === ')') {
      const parent = stack.pop();
      if (!parent) {
        throw new Error(`Invalid Newick: unbalanced ')' at position ${i}`);
      }
      current = parent;
      expectLength = false;
      i++;
    } else if (ch === ':') {
      expectLength = true;
      i++;
    } else if (ch === "'" || ch === '"') {
      let label = '';
      i++;
      while (i < n) {
        if (newick[i] === ch) {
          if (newick[i + 1] === ch) {
            label += ch;
            i += 2;
            continue;
          }
          i++;
          break;
        }
        label += newick[i++];
      }
      current.name += label;
    } else {
      let j = i;
      while (j < n && !'(),:;['.includes(newick[j])) {
        j++;
      }
      const token = newick.slice(i, j).trim();
      i = j;
      if (expectLength) {
        const value = Number.parseFloat(token);
        current.branchLength = Number.isFinite(value) ? value : null;
        expectLength = false;
      } else {
        current.name += token;
      }
    }
  }
  if (stack.length > 0) {
    throw new Error("Invalid Newick: missing ')'");
  }
  return root;
}

const NEEDS_QUOTES = /[()[\]':;,\t\n\r"]/;

function formatLabel(label: string, quoteSpaces: boolean): string {
  if (!label) {
    return '';
  }
  if (NEEDS_QUOTES.test(label) || (quoteSpaces && label.includes(' '))) {
    return `'${label.replace(/'/g, "''")}'`;
  }
  return label.replace(/ /g, '_');
}

export interface WriteNewickOptions {
  /**
   * Quote labels with spaces instead of writing spaces as underscores. Off by
   * default because the app's Newick reader drops quoted names.
   */
  quoteSpaces?: boolean;
}

/** Serialize a tree. Labels with Newick-special characters are single-quoted. */
export function writeNewick(tree: NewickNode, { quoteSpaces = false }: WriteNewickOptions = {}): string {
  const out: string[] = [];
  const suffix = (n: NewickNode) =>
    formatLabel(n.name, quoteSpaces) + (n.branchLength === null ? '' : `:${n.branchLength}`);
  const stack: (NewickNode | string)[] = [tree];
  while (stack.length > 0) {
    const item = stack.pop() as NewickNode | string;
    if (typeof item === 'string') {
      out.push(item);
    } else if (item.children.length === 0) {
      out.push(suffix(item));
    } else {
      stack.push(`)${suffix(item)}`);
      for (let i = item.children.length - 1; i >= 0; i--) {
        stack.push(item.children[i]);
        if (i > 0) {
          stack.push(',');
        }
      }
      stack.push('(');
    }
  }
  return `${out.join('')};`;
}

function addLengths(a: number | null, b: number | null): number | null {
  return a === null && b === null ? null : (a ?? 0) + (b ?? 0);
}

/**
 * Rebuild the tree keeping the tips for which `label` returns a string (renamed to
 * it). Drops empty subtrees and collapses unary nodes, summing branch lengths onto
 * the surviving child (which keeps its own name). Returns a new tree.
 */
function rebuild(
  tree: NewickNode,
  label: (tip: NewickNode) => string | null,
): { tree: NewickNode; kept: number } {
  const order = preOrder(tree);
  const result = new Map<NewickNode, NewickNode | null>();
  // Tip labels are decided left to right so "first occurrence wins" is stable.
  let kept = 0;
  for (const n of order) {
    if (n.children.length === 0) {
      const name = label(n);
      if (name !== null) {
        kept++;
      }
      result.set(n, name === null ? null : node(name, n.branchLength));
    }
  }
  for (let k = order.length - 1; k >= 0; k--) {
    const n = order[k];
    if (n.children.length === 0) {
      continue;
    }
    const children: NewickNode[] = [];
    for (const child of n.children) {
      const built = result.get(child);
      if (built) {
        children.push(built);
      }
    }
    if (children.length === 0) {
      result.set(n, null);
    } else if (children.length === 1) {
      const only = children[0];
      only.branchLength = addLengths(only.branchLength, n.branchLength);
      result.set(n, only);
    } else {
      result.set(n, { name: n.name, branchLength: n.branchLength, children });
    }
  }
  const root = result.get(tree) ?? node();
  // A root collapsed onto its only child keeps the original (stem) length.
  root.branchLength = tree.branchLength;
  return { tree: root, kept };
}

/**
 * Rename tips with `map`; tips mapped to null, and repeats of a label already used
 * by an earlier tip, are dropped (tip names must be unique for the app).
 */
export function relabelTips(
  tree: NewickNode,
  map: (label: string) => string | null,
): { tree: NewickNode; kept: number; dropped: number } {
  const seen = new Set<string>();
  let tips = 0;
  const out = rebuild(tree, (tip) => {
    tips++;
    const name = map(tip.name);
    if (name === null || seen.has(name)) {
      return null;
    }
    seen.add(name);
    return name;
  });
  return { tree: out.tree, kept: out.kept, dropped: tips - out.kept };
}

/** Keep only tips whose label is in `keep`; collapses unary nodes and empty subtrees. */
export function pruneToTips(tree: NewickNode, keep: Set<string>): NewickNode {
  return rebuild(tree, (tip) => (keep.has(tip.name) ? tip.name : null)).tree;
}

/** Collapse all unary (single-child) internal nodes, summing branch lengths. */
export function collapseUnary(tree: NewickNode): NewickNode {
  return rebuild(tree, (tip) => tip.name).tree;
}

/**
 * Grafen (1989) branch lengths, as `ape::compute.brlen(method = 'Grafen', power = rho)`:
 * node height = ((tips under node - 1) / (total tips - 1))^rho, tips at 0, root at 1.
 * Returns a new ultrametric tree; the root gets no branch length.
 */
export function grafenBranchLengths(tree: NewickNode, rho = 1): NewickNode {
  const order = preOrder(tree);
  const tipsUnder = new Map<NewickNode, number>();
  for (let k = order.length - 1; k >= 0; k--) {
    const n = order[k];
    let count = n.children.length === 0 ? 1 : 0;
    for (const child of n.children) {
      count += tipsUnder.get(child) as number;
    }
    tipsUnder.set(n, count);
  }
  const total = tipsUnder.get(tree) as number;
  const height = (n: NewickNode) =>
    n.children.length === 0 || total < 2 ? 0 : (((tipsUnder.get(n) as number) - 1) / (total - 1)) ** rho;

  const copy = new Map<NewickNode, NewickNode>();
  const root = node(tree.name, null);
  copy.set(tree, root);
  for (const n of order) {
    const parent = copy.get(n) as NewickNode;
    const parentHeight = height(n);
    for (const child of n.children) {
      const c = node(child.name, parentHeight - height(child));
      parent.children.push(c);
      copy.set(child, c);
    }
  }
  return root;
}

/** Topology and branch-length summary. */
export function treeStats(tree: NewickNode): TreeStats {
  let tips = 0;
  let internalNodes = 0;
  let polytomies = 0;
  let bifurcating = 0;
  let hasBranchLengths = true;
  let minDepth = Number.POSITIVE_INFINITY;
  let maxDepth = 0;
  const stack: [NewickNode, number][] = [[tree, 0]];
  while (stack.length > 0) {
    const [n, depth] = stack.pop() as [NewickNode, number];
    if (n.children.length === 0) {
      tips++;
      minDepth = Math.min(minDepth, depth);
      maxDepth = Math.max(maxDepth, depth);
      continue;
    }
    internalNodes++;
    if (n.children.length === 2) {
      bifurcating++;
    } else if (n.children.length > 2) {
      polytomies++;
    }
    for (const child of n.children) {
      if (child.branchLength === null) {
        hasBranchLengths = false;
      }
      stack.push([child, depth + (child.branchLength ?? 0)]);
    }
  }
  const withLengths = hasBranchLengths && internalNodes > 0;
  return {
    tips,
    internalNodes,
    polytomies,
    resolution: internalNodes === 0 ? 0 : bifurcating / internalNodes,
    hasBranchLengths: withLengths,
    isUltrametric: withLengths && maxDepth - minDepth <= 1e-6 * maxDepth,
    depth: withLengths ? maxDepth : null,
  };
}

const MRCA_LABEL = /^mrcaott\d+ott\d+$/;
const OTT_SUFFIX = /(?:^|[_ ])ott(\d+)$/;

/**
 * Strip Open Tree id parts from a label: `Homo_sapiens_ott770315` and
 * `Homo sapiens ott770315` become the name, `ott770315` and `mrcaott1ott2` become ''.
 */
export function cleanOttLabel(label: string): string {
  if (MRCA_LABEL.test(label)) {
    return '';
  }
  return label.replace(OTT_SUFFIX, '');
}

/** The OTT id in a label like `ott770315` or `Homo_sapiens_ott770315`, else null. */
export function ottIdFromLabel(label: string): number | null {
  if (MRCA_LABEL.test(label)) {
    return null;
  }
  const match = OTT_SUFFIX.exec(label);
  return match ? Number(match[1]) : null;
}
