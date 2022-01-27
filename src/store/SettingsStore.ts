import { makeObservable, observable, action } from 'mobx';
import type RootStore from './RootStore';

type StatisticsBy = 'species' | 'bioregions';

export default class SettingsStore {
  rootStore: RootStore;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    makeObservable(this, {
      statisticsBy: observable,
    });
  }

  statisticsBy: StatisticsBy = 'bioregions';
  setStatisticsBy = action((value: StatisticsBy) => {
    this.statisticsBy = value;
  });
}
