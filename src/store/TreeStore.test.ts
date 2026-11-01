// TreeStore.loadString validates before any state change; reset() clears everything
// derived from the tree.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type RootStore from './RootStore';
import TreeStore, { validateNewick } from './TreeStore';

function setup() {
  const infomapStore = { updateNetwork: vi.fn() };
  const store = new TreeStore({ infomapStore } as unknown as RootStore);
  return { store, infomapStore };
}

const VALID = '((A_a:1,B_b:1):1,C_c:2);';

describe('TreeStore.loadString', () => {
  it('loads a valid tree', () => {
    const { store } = setup();
    store.loadString(VALID);
    expect(store.tree).not.toBeNull();
    expect(store.treeString).toBe(VALID);
    expect(store.isLoaded).toBe(true);
    expect(store.isLoading).toBe(false);
    expect(store.numLeafNodes).toBe(3);
  });

  it.each([
    ['a CSV', 'species,longitude,latitude\nA a,1,2\n'],
    ['a truncated tree', '((a,b'],
    ['plain text', 'hello'],
    ['an empty string', ''],
    ['a single leaf', '(a);'],
    ['two trees', '(a,b);(c,d);'],
  ])('rejects %s and changes nothing', (_what, text) => {
    const { store, infomapStore } = setup();
    store.loadString(VALID);
    const { tree, treeString } = store;
    infomapStore.updateNetwork.mockClear();
    expect(() => store.loadString(text)).toThrow('Not a valid Newick tree');
    expect(store.tree).toBe(tree);
    expect(store.treeString).toBe(treeString);
    expect(store.isLoading).toBe(false);
    expect(store.isLoaded).toBe(true);
    expect(infomapStore.updateNetwork).not.toHaveBeenCalled();
  });

  it('accepts quoted labels, comments, a root label and no terminating semicolon', () => {
    expect(() => validateNewick("[&R] ('A (x)':1,'B,y':2)root:0;")).not.toThrow();
    expect(() => validateNewick('(a,b)')).not.toThrow();
  });

  it('accepts the bundled example trees', () => {
    for (const name of ['demo', 'head', 'mammals_neotropics', 'mammals_global']) {
      let text: string;
      try {
        text = readFileSync(`public/data/${name}.nwk`, 'utf8');
      } catch {
        continue; // example data not fetched
      }
      expect(() => validateNewick(text), name).not.toThrow();
    }
  });
});

describe('TreeStore.reset', () => {
  it('clears the tree, its string, node map and stats', () => {
    const { store } = setup();
    store.loadString(VALID);
    expect(store.treeNodeMap.size).toBeGreaterThan(0);
    store.reset();
    expect(store.tree).toBeNull();
    expect(store.treeString).toBeNull();
    expect(store.treeNodeMap.size).toBe(0);
    expect(store.numLeafNodes).toBe(0);
    expect(store.isLoaded).toBe(false);
    expect(store.isLoading).toBe(false);
  });
});
