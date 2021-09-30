import * as d3 from 'd3';
import { action, makeObservable, observable } from 'mobx';
import { spawn, Thread, Worker } from 'threads';
import { QuadtreeGeoBinner, Node } from '../utils/QuadTreeGeoBinner';
import type RootStore from './RootStore';
import Infomap from '@mapequation/infomap';
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
    const binner = new QuadtreeGeoBinner();

    console.log('Stream...');
    // const batchSize = 10000;

    const loader = this.loadData((items) => {
      for (let item of items) {
        const pointFeature = createPointFeature(
          [item.longitude, item.latitude],
          { name: item.species },
        );
        this.pointCollection.features.push(pointFeature);
        binner.addFeature(pointFeature);
        // if (this.pointCollection.features.length % batchSize === 0) {
        //   this.updatePointCollection();
        // }
        this.rootStore.mapStore.renderPoint(pointFeature.geometry.coordinates);
      }
    });

    await loader.next(); // Waits until streaming is done
    this.updatePointCollection();

    const cells = binner.cellsNonEmpty();
    console.log('Done binning!', cells);
    console.log(
      'Leaf cells:',
      cells.filter((cell) => cell.isLeaf),
    );
    console.log('binner:', binner);
    console.log('point collection:', this.pointCollection);
    console.log(
      'speciesTopList:',
      cells.map((cell) => cell.speciesTopList),
    );

    const m = new Map<string, Set<string>>();

    cells.forEach((cell) => {
      cell.speciesTopList.forEach(({ species }) => {
        if (!m.has(species)) {
          m.set(species, new Set());
        }

        const ids = m.get(species);
        ids?.add(cell.id);
      });
    });

    let nodeId = 0;
    let network = '*Vertices\n';

    let nodeMap = new Map<string, number>();

    for (let species of m.keys()) {
      let id = nodeId++;
      nodeMap.set(species, id);
      network += `${id} "${species}"\n`;
    }

    let bipartiteStartId = nodeId;

    for (let cell of cells) {
      let id = nodeId++;
      nodeMap.set(cell.id, id);
      network += `${id} "${cell.id}"\n`;
    }

    network += `*Bipartite ${bipartiteStartId}\n`;

    for (let each of m.entries()) {
      for (let cell of each[1].values()) {
        network += `${nodeMap.get(each[0])} ${nodeMap.get(cell)}\n`;
      }
    }

    //console.log(network);

    try {
      const { json } = await new Infomap()
        .on('data', (output) => console.log(output))
        .runAsync({
          network,
          args: '-o json --silent',
        });

      console.log(json);
    } catch (err) {
      console.log(err);
    }

    const colorToRGBArray = (hex: string) =>
      hex.match(/[0-9a-f]{2}/g)?.map((x) => parseInt(x, 16));
    const domainExtent = d3.extent(cells, (n: Node) => n.recordsPerArea) as [
      number,
      number,
    ];
    const domainMax = domainExtent[1];
    const domain = d3.range(0, domainMax, domainMax / 8); // Exact doesn't include the end for some reason
    domain.push(domainMax);
    const heatmapOpacityScale = d3
      .scaleLog()
      .domain(domainExtent)
      .range([0, 8]);
    const colorRange = [
      '#ffffcc',
      '#ffeda0',
      '#fed976',
      '#feb24c',
      '#fd8d3c',
      '#fc4e2a',
      '#e31a1c',
      '#bd0026',
      '#800026',
    ]; // Colorbrewer YlOrRd
    const heatmapColor = (d: Node) =>
      colorToRGBArray(
        colorRange[Math.floor(heatmapOpacityScale(d.recordsPerArea))],
      );

    this.loaded = true;
  }
}
