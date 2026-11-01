import { makeObservable, observable, action } from 'mobx';
import type RootStore from './RootStore';

export type StatisticsBy = 'species' | 'bioregions';
export type BioregionSort =
  | 'flow'
  | 'records'
  | 'species'
  | 'cells'
  | 'area'
  | 'onlyHere';
export type BioregionDensity = 'detailed' | 'compact';

export default class SettingsStore {
  rootStore: RootStore;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    makeObservable(this, {
      statisticsBy: observable,
      showStatusBarLabels: observable,
      bioregionSort: observable,
      bioregionDensity: observable,
      showWidespreadMembers: observable,
    });
  }

  statisticsBy: StatisticsBy = 'bioregions';
  setStatisticsBy = action((value: StatisticsBy) => {
    this.statisticsBy = value;
  });

  // Whether the view status bars show the small text caption beneath each control.
  // Off by default — the icons are self-explanatory; labels are an opt-in aid.
  showStatusBarLabels: boolean = false;
  setShowStatusBarLabels = action((value: boolean) => {
    this.showStatusBarLabels = value;
  });

  // Bioregion list: sort order and card density. `null` density means automatic (detailed cards
  // for a handful of bioregions, compact rows for many) until the user picks one.
  bioregionSort: BioregionSort = 'flow';
  setBioregionSort = action((value: BioregionSort) => {
    this.bioregionSort = value;
  });

  bioregionDensity: BioregionDensity | null = null;
  setBioregionDensity = action((value: BioregionDensity | null) => {
    this.bioregionDensity = value;
  });

  // Characteristic species lists: whether members with most of their records in other
  // bioregions (fidelity < 0.5) are listed. Hidden by default so core species lead.
  showWidespreadMembers: boolean = false;
  setShowWidespreadMembers = action((value: boolean) => {
    this.showWidespreadMembers = value;
  });
}
