import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import { makeObservable, observable } from 'mobx';
import { spawn, Thread, Worker } from 'threads';
import { QuadtreeGeoBinner, Node } from '../utils/QuadTreeGeoBinner';
import Infomap from '@mapequation/infomap';
import LandStore from './LandStore';

let infomap = new Infomap()
  .on('data', (data) => console.log(data))
  .on('error', (err) => console.error(err))
  .on('finished', ({ json }) => console.log(json));

let network = `#source target [weight]
0 1
0 2
0 3
1 0
1 2
2 1
2 0
3 0
3 4
3 5
4 3
4 5
5 4
5 3`;

infomap.run({ network, args: { silent: true, output: ['json'] } });

type Point = {
  position: number[];
  // normal: number[],
  // color: string,
};

export default class Store {
  result: number;
  landStore: LandStore = new LandStore(this);
  dataLoaded = false;
  layers: any[] = [];

  constructor() {
    console.log('Creating root store...');
    makeObservable(this, {
      layers: observable,
      dataLoaded: observable,
    });

    this.result = 10;
    // this.landStore = new LandStore(this);

    // this.loadDataLayer().catch(console.error);
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

  async loadDataLayer() {
    const points: Point[] = [];
    const binner = new QuadtreeGeoBinner();

    console.log('Stream...');
    const loader = this.loadData((items) => {
      for (let item of items) {
        points.push({
          position: [item.longitude, item.latitude, 0],
        });
        binner.addFeature({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [item.longitude, item.latitude, 0],
          },
          properties: { species: item.species },
        });
      }
    });
    await loader.next();

    const cells = binner.cellsNonEmpty();
    console.log('Done binning!', cells);
    console.log(
      'Leaf cells:',
      cells.filter((cell) => cell.isLeaf),
    );
    console.log('binner:', binner);
    console.log('points:', points);
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
          args: '-o json',
        });

      console.log(json);
    } catch (err) {
      console.log(err);
    }

    // const pointLayer = new PointCloudLayer({
    //   id: 'point-cloud-layer',
    //   // @ts-ignore
    //   data: points,
    //   pickable: false,
    //   coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
    //   //coordinateOrigin: [-122.4, 37.74],
    //   pointSize: 2,
    //   //getPosition: (d) => d.position,
    //   // getNormal: (d: unknown): number[] => d.normal,
    //   getColor: [255, 0, 0, 50],
    // });

    //this.layers.push(pointLayer);

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

    // const cellLayer = new GeoJsonLayer({
    //   id: 'cell-layer',
    //   data: cells,
    //   pickable: true,
    //   stroked: false,
    //   filled: true,
    //   extruded: true,
    //   lineWidthScale: 20,
    //   lineWidthMinPixels: 2,
    //   //getFillColor: [160, 160, 180, 200],
    //   getFillColor: (d: unknown) => heatmapColor(d as Node),
    //   getLineColor: [200, 200, 200],
    //   getRadius: 100,
    //   getLineWidth: 2,
    //   getElevation: 30,
    // });
    // this.layers.push(cellLayer);

    this.dataLoaded = true;
  }
}
