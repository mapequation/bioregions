import { makeObservable, observable, action } from 'mobx';
import type RootStore from './RootStore';

export type StatisticsBy = 'species' | 'bioregions';

export default class SettingsStore {
  rootStore: RootStore;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    makeObservable(this, {
      statisticsBy: observable,
      showStatusBarLabels: observable,
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
}
