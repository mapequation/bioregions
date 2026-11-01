import { action, computed, makeObservable, observable, observableRef } from 'mobx';
import type RootStore from './RootStore';

/**
 * Which bioregion the user is focusing on, shared by the map, the bioregion list and the tree.
 *
 * - `selectedId` is the persistent selection (click a map cell, a list card or Escape to clear).
 * - `previewId` is a transient emphasis while the pointer rests on a list card or minimap.
 * - `treeIds` is the transient set lit up by hovering a tree branch (its ancestral range).
 * - `searchIds` is the set of bioregions where a searched species occurs (a range query).
 *
 * `emphasized` resolves them in priority order (tree hover, preview, selection, search) into the
 * set of bioregions to keep at full strength; MapStore dims every other cell from it.
 */
export default class SelectionStore {
  rootStore: RootStore;
  selectedId: number | null = null;
  previewId: number | null = null;
  treeIds: ReadonlySet<number> | null = null;
  searchIds: ReadonlySet<number> | null = null;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;
    makeObservable(this, {
      selectedId: observable,
      previewId: observable,
      treeIds: observableRef,
      searchIds: observableRef,
      emphasized: computed,
      select: action,
      toggle: action,
      preview: action,
      setTreeIds: action,
      setSearchIds: action,
      clear: action,
    });
  }

  get emphasized(): ReadonlySet<number> | null {
    if (this.treeIds !== null && this.treeIds.size > 0) return this.treeIds;
    const id = this.previewId ?? this.selectedId;
    if (id !== null) return new Set([id]);
    return this.searchIds;
  }

  isDimmed(bioregionId: number): boolean {
    const set = this.emphasized;
    return set !== null && !set.has(bioregionId);
  }

  select(bioregionId: number | null) {
    this.selectedId = bioregionId || null;
  }

  toggle(bioregionId: number) {
    this.select(this.selectedId === bioregionId ? null : bioregionId);
  }

  preview(bioregionId: number | null) {
    this.previewId = bioregionId || null;
  }

  setTreeIds(ids: ReadonlySet<number> | null) {
    this.treeIds = ids;
  }

  setSearchIds(ids: ReadonlySet<number> | null) {
    this.searchIds = ids;
  }

  clear() {
    this.selectedId = null;
    this.previewId = null;
    this.treeIds = null;
    this.searchIds = null;
  }
}
