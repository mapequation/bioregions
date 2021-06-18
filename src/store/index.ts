import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import { GeoJsonLayer, PointCloudLayer } from '@deck.gl/layers';
import { makeObservable, observable } from 'mobx';
import { spawn, Thread, Worker } from 'threads';
import { COORDINATE_SYSTEM, RGBAColor } from '@deck.gl/core';
import { QuadtreeGeoBinner, Node } from '../utils/QuadTreeGeoBinner';

// type Layers = GeoJsonLayer<any, any>[];

type Point = {
  position: number[];
  // normal: number[],
  // color: string,
};

class Store {
  result: number;
  landLoaded: boolean = false;
  dataLoaded: boolean = false;

  layers: any[] = [];

  constructor() {
    makeObservable(this, {
      layers: observable,
      landLoaded: observable,
      dataLoaded: observable,
    });

    this.result = 10;

    this.loadLandLayer().catch(console.error);
    this.initWorker().catch(console.error);
  }

  async loadLandLayer() {
    console.log('Loading land.topojson...');
    const res = await fetch('maps/physical/land.topojson');
    if (!res.ok) {
      console.error(`Failed to load land: ${res.statusText}`);
      return;
    }
    const land = await res.json();
    const geojson = topojson.feature(land, land.objects.land);
    console.log('geojson:', geojson);
    const layer = new GeoJsonLayer({
      id: 'geojson-layer',
      // @ts-ignore
      data: geojson,
      pickable: true,
      stroked: false,
      filled: true,
      extruded: true,
      lineWidthScale: 20,
      lineWidthMinPixels: 2,
      getFillColor: [160, 160, 180, 200],
      //getLineColor: d => colorToRGBArray(d.properties.color),
      getLineColor: [200, 200, 200],
      getRadius: 100,
      getLineWidth: 1,
      getElevation: 30,
    });
    console.log('Add geojson layer...');
    this.landLoaded = true;
    this.layers.push(layer);
    console.log('Done!');
  }

  async initWorker() {
    const worker = new Worker('../workers/DataWorker.ts');

    const dataWorker = await spawn(worker);

    const points: Point[] = [];
    const binner = new QuadtreeGeoBinner();

    console.log('Stream...');
    dataWorker.stream().subscribe((value: any[]) => {
      for (let item of value) {
        // @ts-ignore
        points.push({
          position: [item.longitude, item.latitude, 0],
        });
        binner.addFeature({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [item.longitude, item.latitude, 0],
          },
          properties: {},
        });
      }
    });

    console.log(await dataWorker.loadSample());
    const bins = binner.bins();
    console.log('Done binning!', bins);
    console.log('binner:', binner);
    console.log('points:', points);

    const pointLayer = new PointCloudLayer({
      id: 'point-cloud-layer',
      // @ts-ignore
      data: points,
      pickable: false,
      coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
      //coordinateOrigin: [-122.4, 37.74],
      pointSize: 2,
      //getPosition: (d) => d.position,
      // getNormal: (d: unknown): number[] => d.normal,
      getColor: [255, 0, 0, 50],
    });

    //this.layers.push(pointLayer);

    const colorToRGBArray = (hex: string) =>
      hex.match(/[0-9a-f]{2}/g)?.map((x) => parseInt(x, 16)) as RGBAColor;
    const domainExtent = d3.extent(bins, (n: Node) => n.recordsPerArea) as [
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

    const cellLayer = new GeoJsonLayer({
      id: 'cell-layer',
      // @ts-ignore
      data: bins,
      pickable: true,
      stroked: false,
      filled: true,
      extruded: true,
      lineWidthScale: 20,
      lineWidthMinPixels: 2,
      //getFillColor: [160, 160, 180, 200],
      getFillColor: heatmapColor,
      //getLineColor: d => colorToRGBArray(d.properties.color),
      getLineColor: [200, 200, 200],
      getRadius: 100,
      getLineWidth: 1,
      getElevation: 30,
    });
    this.layers.push(cellLayer);

    this.dataLoaded = true;

    await Thread.terminate(dataWorker);
  }
}

const store = new Store();

export default store;
