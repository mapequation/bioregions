import * as topojson from 'topojson-client';
import { GeoJsonLayer, PointCloudLayer } from '@deck.gl/layers';
import { makeObservable, observable } from 'mobx';
import { spawn, Thread, Worker } from 'threads';
import { COORDINATE_SYSTEM } from '@deck.gl/core';

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

    const data: Point[] = [];

    // for (let i = 0; i < 360; i++) {
    //   data.push({
    //     position: [-180 + i, 0, 10],
    //   });
    // }

    //console.log(await binningWorker.loadSample());
    dataWorker.stream().subscribe((value: any[]) => {
      for (let item of value) {
        //console.log(item);
        // @ts-ignore
        data.push({
          position: [item.longitude, item.latitude, 0],
        });
      }
    });

    console.log(await dataWorker.loadSample());

    const layer = new PointCloudLayer({
      id: 'point-cloud-layer',
      // @ts-ignore
      data,
      pickable: false,
      coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
      //coordinateOrigin: [-122.4, 37.74],
      pointSize: 2,
      //getPosition: (d) => d.position,
      // getNormal: (d: unknown): number[] => d.normal,
      getColor: [255, 0, 0, 50],
    });
    this.layers.push(layer);
    this.dataLoaded = true;

    await Thread.terminate(dataWorker);
  }
}

const store = new Store();

export default store;
