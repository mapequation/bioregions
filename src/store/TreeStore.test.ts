import { describe, expect, it, vi } from 'vitest';
import type RootStore from './RootStore';
import TreeStore from './TreeStore';

function createTreeStore() {
  const infomapStore = { addError: vi.fn(), updateNetwork: vi.fn() };
  const rootStore = { infomapStore } as unknown as RootStore;
  return { treeStore: new TreeStore(rootStore), infomapStore };
}

describe('TreeStore', () => {
  it('loads a tree from a string', () => {
    const { treeStore, infomapStore } = createTreeStore();

    treeStore.loadString('(a:1,b:1);');

    expect(treeStore.isLoaded).toBe(true);
    expect(treeStore.isLoading).toBe(false);
    expect(treeStore.numLeafNodes).toBe(2);
    expect(infomapStore.addError).not.toHaveBeenCalled();
  });

  it('reports a malformed tree instead of throwing', async () => {
    const { treeStore, infomapStore } = createTreeStore();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    treeStore.loadString('(a:1,b:1);');

    await expect(treeStore.load('data:,(a,b)(c,d);')).resolves.toBeUndefined();
    expect(() => treeStore.loadString('((a,b);')).not.toThrow();

    expect(infomapStore.addError).toHaveBeenCalledTimes(2);
    expect(infomapStore.addError.mock.calls[0][0]).toMatch(
      /^Could not load the tree: Newick: unexpected '\('/,
    );
    expect(treeStore.isLoading).toBe(false);
    expect(treeStore.treeString).toBe('(a:1,b:1);');
    expect(treeStore.numLeafNodes).toBe(2);
    error.mockRestore();
  });
});
