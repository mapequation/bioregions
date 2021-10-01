import * as d3 from 'd3';
import { action, makeObservable, observable } from 'mobx';
import { spawn, Thread, Worker } from 'threads';
import { QuadtreeGeoBinner, Node } from '../utils/QuadTreeGeoBinner';
import type RootStore from './RootStore';
import type { Feature, FeatureCollection, Point } from '../types/geojson';

// export type Point = [number, number];

// export interface PointProps extends GeoJsonProperties {
//   name: string,
// }

export interface PointProperties {
  name: string;
  [key: string]: any;
}
// export type PointProperties = GeoJsonProperties & {
//   name: string,
// }

export type PointFeature = Feature<Point, PointProperties>;
export type PointFeatureCollection = FeatureCollection<Point, PointProperties>;

export const createPointFeature = (
  coordinates: [number, number],
  properties: PointProperties,
): PointFeature => ({
  type: 'Feature',
  geometry: {
    type: 'Point',
    coordinates,
  },
  properties,
});

export const createPointCollection = (
  features: PointFeature[] = [],
): PointFeatureCollection => ({
  type: 'FeatureCollection',
  features,
});

export default class SpeciesStore {
  rootStore: RootStore;
  loaded: boolean = false;
  pointCollection: PointFeatureCollection = createPointCollection();
  binner: QuadtreeGeoBinner = new QuadtreeGeoBinner();

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    makeObservable(this, {
      loaded: observable,
      pointCollection: observable.ref,
      setPointCollection: action,
    });

    this.loadSpecies().catch(console.error);
  }

  setPointCollection(pointCollection: PointFeatureCollection) {
    this.pointCollection = pointCollection;
  }

  updatePointCollection() {
    this.setPointCollection(
      createPointCollection(this.pointCollection.features),
    );
  }

  private async *loadData(
    getItems: (
      items: { longitude: number; latitude: number; species: string }[],
    ) => void,
  ) {
    const dataWorker = await spawn(new Worker('../workers/DataWorker.ts'));

    dataWorker.stream().subscribe(getItems);

    yield dataWorker.loadSample();

    return await Thread.terminate(dataWorker);
  }

  async loadSpecies() {
    console.log('Stream...');
    // const batchSize = 10000;
    const { mapStore } = this.rootStore;

    const loader = this.loadData((items) => {
      for (let item of items) {
        const pointFeature = createPointFeature(
          [item.longitude, item.latitude],
          { name: item.species },
        );
        this.pointCollection.features.push(pointFeature);
        this.binner.addFeature(pointFeature);
        // if (this.pointCollection.features.length % batchSize === 0) {
        //   this.updatePointCollection();
        // }
        if (mapStore.renderType === 'raw') {
          mapStore.renderPoint(pointFeature.geometry.coordinates);
        }
      }
    });

    await loader.next(); // Waits until streaming is done
    this.updatePointCollection();
    mapStore.render();

    const cells = this.binner.cellsNonEmpty();
    console.log('Done binning!', cells);
    console.log(
      'Leaf cells:',
      cells.filter((cell) => cell.isLeaf),
    );
    console.log('binner:', this.binner);
    console.log('point collection:', this.pointCollection);
    console.log(
      'speciesTopList:',
      cells.map((cell) => cell.speciesTopList),
    );

    await this.rootStore.infomapStore.runInfomap(cells);

    mapStore.render();
    this.loaded = true;
  }
}
