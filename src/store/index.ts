import * as topojson from "topojson-client";
import { GeoJsonLayer } from "@deck.gl/layers";
import { makeObservable, observable } from "mobx";
import { spawn, Thread, Worker } from "threads";

type Layers = GeoJsonLayer<any, any>[];

class Store {
  result: number;
  landLoaded: boolean = false;

  layers: Layers = [];

  constructor() {
    makeObservable(this, {
      layers: observable,
      landLoaded: observable,
    });

    this.result = 10;

    window.setTimeout(() => {
      this.loadLandLayer();
      this.initWorker().catch(console.error);
    }, 500);
    // this.loadLandLayer();
  }

  async loadLandLayer() {
    console.log("Loading land.topojson...");
    const res = await fetch("maps/physical/land.topojson");
    if (!res.ok) {
      console.error(`Failed to load land: ${res.statusText}`);
      return;
    }
    const land = await res.json();
    const geojson = topojson.feature(land, land.objects.land);
    console.log("geojson:", geojson);
    const layer = new GeoJsonLayer({
      id: "geojson-layer",
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
    console.log("Add geojson layer...");
    this.landLoaded = true;
    this.layers.push(layer);
    console.log("Done!");
  }

  async initWorker() {
    const worker = new Worker("../workers/BinningWorker.ts");

    const binningWorker = await spawn(worker);
    console.log(await binningWorker.bin());

    await Thread.terminate(binningWorker);
  }
}

const store = new Store();

export default store;
