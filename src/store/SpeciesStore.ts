import { action, makeObservable, observable, computed, runInAction } from 'mobx';
// import { spawn, Thread, Worker } from 'threads';
import type { ParseConfig } from 'papaparse';
import QuadtreeGeoBinner from '../utils/QuadTree';
import { csvParse, tsvFormatRows, color as Color } from 'd3';
import type RootStore from './RootStore';
import type {
  Feature,
  FeatureCollection,
  Point,
  MultiPoint,
  GeometryCollection,
  Geometry,
  Polygon,
} from '../types/geojson';
import { Timer } from '../utils/time';
import throttle from 'lodash/throttle';
import { normalizeSpeciesName } from '../utils/names';
import { isAbortError } from '../sources/http';

// export type FeatureProperties = GeoJsonProperties & {
//   name: string;
// };
export interface FeatureProperties {
  name: string;
  [key: string]: unknown;
}

export type PointFeature = Feature<Point, FeatureProperties>;
export type GeometryFeature = Feature<Geometry, FeatureProperties>;
export type PolygonFeature = Feature<Polygon, FeatureProperties>;
export type GeoFeature = PointFeature | GeometryFeature;
export type PointFeatureCollection = FeatureCollection<
  Point,
  FeatureProperties
>;
export type GeometryFeatureCollection = FeatureCollection<
  Geometry,
  FeatureProperties
>;

export const createPointFeature = (
  coordinates: [longitude: number, latitude: number],
  properties: FeatureProperties,
): PointFeature => ({
  type: 'Feature',
  geometry: {
    type: 'Point',
    coordinates,
  },
  properties,
});

export const createFeatureCollection = (
  features: GeometryFeature[] = [],
): GeometryFeatureCollection => ({
  type: 'FeatureCollection',
  features,
});

export const createMultiPointGeometryCollection = (
  geometries: MultiPoint[] = [],
): GeometryCollection => ({
  type: 'GeometryCollection',
  geometries,
});

export type Species = {
  name: string;
  bioregionId?: number;
  count: number;
  countPerRegion: Map<number, number>;
  numGridCells?: number;
  numGridCellsWithinModule?: number;
};

/** Outcome of the file loaders (`load`, `loadString`, `loadShapefile`). */
export interface FileLoadResult {
  /** Features added (0 only for a load cancelled before the first one). */
  received: number;
}

export interface FileLoadOptions {
  nameColumn?: string;
  longColumn?: string;
  latColumn?: string;
  /**
   * Called once, in the same action as the first feature, before it is added: the
   * data owner's commit (it clears the previous data and swaps the source slot).
   */
  onFirstRecord?: () => void;
}

export const NO_USABLE_ROWS = 'No usable rows (check the species column)';
export const NO_SHAPEFILE_FEATURES = 'No features found in the shapefile';

/** Outcome of `SpeciesStore.loadRecords`. */
export interface LoadRecordsResult {
  /** Records added to the store (0: the previous dataset was left untouched). */
  received: number;
}

export default class SpeciesStore {
  rootStore: RootStore;
  loaded: boolean = false;
  isLoading: boolean = false;
  numPoints: number = 0;
  numPointsDebounced: number = 0;
  numPolygons: number = 0;
  numPolygonsDebounced: number = 0;
  multiPointCollection: GeometryCollection =
    createMultiPointGeometryCollection();
  collection: GeometryFeatureCollection = createFeatureCollection();
  binner: QuadtreeGeoBinner = new QuadtreeGeoBinner(this);
  speciesMap = new Map<string, Species>();
  timer = new Timer();
  speed: number = 0;
  seconds: number = 0;
  /** Aborts the running load (file worker or record stream); see `cancelLoad`. */
  loadController: AbortController | null = null;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    makeObservable(this, {
      name: computed,
      loaded: observable,
      isLoading: observable,
      numPointsDebounced: observable,
      numPolygonsDebounced: observable,
      speed: observable,
      seconds: observable,
      collection: observable.ref,
      speciesMap: observable.ref,
      havePolygons: computed,
      speciesTopList: computed,
      numSpecies: computed,
      numRecords: computed,
      setCollection: action,
      setIsLoaded: action,
      setIsLoading: action,
    });
  }

  clearData = action(() => {
    this.loaded = false;
    this.isLoading = false;
    this.numPoints = 0;
    this.numPolygons = 0;
    this.setNumPointsDebounced.cancel();
    this.setNumPolygonsDebounced.cancel();
    this.numPointsDebounced = 0;
    this.numPolygonsDebounced = 0;
    this.multiPointCollection = createMultiPointGeometryCollection();
    this.updateCollection(createFeatureCollection());
    this.binner.setTreeNeedUpdate();
    this.speciesMap = new Map<string, Species>();
    this.rootStore.mapStore.render();
  });

  clearBioregions = () => {
    this.binner.cells.forEach((cell) => {
      cell.bioregionId = 0;
      cell.overlappingBioregions.clear();
      cell.connectedBioregions.clear();
    });
    this.speciesMap.forEach((species) => {
      species.bioregionId = undefined;
    });
  };

  setNumPointsDebounced = throttle(
    action((value: number) => {
      this.numPointsDebounced = value;
    }),
    200,
    { leading: true, trailing: true },
  );

  setNumPolygonsDebounced = throttle(
    action((value: number) => {
      this.numPolygonsDebounced = value;
    }),
    200,
    { leading: true, trailing: true },
  );

  setSpeed = throttle(
    action((value: number) => {
      this.speed = value;
    }),
    200,
    { leading: true, trailing: true },
  );

  setSeconds = throttle(
    action((value: number) => {
      this.seconds = value;
    }),
    200,
    { leading: true, trailing: true },
  );

  /** Export and network name: the loaded occurrence source's (file stem or query title). */
  get name(): string {
    return this.rootStore.dataStore?.occurrence?.exportName ?? 'data';
  }

  get havePolygons() {
    return this.numPolygons > 0;
  }

  get numRecords() {
    return this.numPointsDebounced + this.numPolygonsDebounced;
  }

  get numSpecies() {
    return this.speciesMap.size;
  }

  get speciesTopList() {
    return Array.from(this.speciesMap.values()).sort(
      (a, b) => b.count - a.count,
    );
  }

  setIsLoaded(loaded: boolean = true) {
    this.isLoading = false;
    this.loaded = loaded;
  }

  setIsLoading(isLoading: boolean = true) {
    this.isLoading = isLoading;
  }

  setCollection(collection: GeometryFeatureCollection) {
    this.collection = collection;
    this.updateSpeciesMap();
  }

  updateCollection(collection = this.collection) {
    this.setCollection(collection);
  }

  updateSpeciesMap() {
    type Name = string;
    const speciesMap = new Map<Name, Species>();
    this.collection.features.forEach((feature) => {
      const { name } = feature.properties;
      const species = speciesMap.get(name) ?? {
        name,
        count: 0,
        countPerRegion: new Map<number, number>(),
      };
      ++species.count;
      speciesMap.set(name, species);
    });
    this.speciesMap = speciesMap;
  }

  addFeature = action((feature: GeometryFeature) => {
    this.collection.features.push(feature);
    if (feature.geometry.type === 'Point') {
      this.binner.addFeature(feature);
      ++this.numPoints;
      this.setNumPointsDebounced(this.numPoints);
      this.setSpeed(this.timer.speed(this.numPoints));
    } else {
      this.rootStore.mapStore.renderShape(feature);
      ++this.numPolygons;
      this.setNumPolygonsDebounced(this.numPolygons);
      this.setSpeed(this.timer.speed(this.numPolygons));
    }

    this.setSeconds(this.timer.elapsedSecondsTotal);
    // const { elapsed } = this.timer;
    // if (elapsed > 1000 / 60) {
    //   await nextAnimationFrame();
    //   this.timer.lap();
    // }
  });

  /**
   * Run the data worker with `message`, passing each data chunk to `onData`.
   * Resolves when the worker completes or the current load is cancelled, and rejects
   * when the worker reports an error (or fails to run at all).
   */
  private runWorker<T>(message: object, onData: (data: T) => void) {
    return new Promise<void>((resolve, reject) => {
      try {
        const dataWorker = new Worker(
          new URL('../workers/DataWorker.ts', import.meta.url),
          { type: 'module' },
        );
        const signal = this.loadController?.signal;
        const stop = () => {
          dataWorker.terminate();
          resolve();
        };
        const fail = (message: string) => {
          signal?.removeEventListener('abort', stop);
          dataWorker.terminate();
          reject(new Error(message));
        };
        signal?.addEventListener('abort', stop, { once: true });

        dataWorker.addEventListener('error', (event: ErrorEvent) => {
          event.preventDefault?.();
          fail(event.message || 'The data worker failed');
        });
        dataWorker.addEventListener('message', (event: MessageEvent) => {
          if (event.data.type === 'status') {
            if (event.data.status === 'complete') {
              signal?.removeEventListener('abort', stop);
              stop();
            } else if (event.data.status === 'error') {
              fail(String(event.data.message ?? 'Could not read the file'));
            }
          } else if (event.data.type === 'data') {
            onData(event.data.data);
          }
        });

        dataWorker.postMessage(message);
      } catch (err) {
        reject(err);
      }
    });
  }

  private loadData(
    file: string | File,
    getItems: (items: { [key: string]: string | number }[]) => void,
    args: ParseConfig = {},
  ) {
    return this.runWorker({ type: 'LOAD', file, args }, getItems);
  }

  private loadShapefileInWorker(
    file: string | File | File[],
    onFeatures: (features: GeometryFeature[]) => void,
    nameKey?: string,
  ) {
    return this.runWorker({ type: 'LOAD_SHAPEFILE', file, nameKey }, onFeatures);
  }

  loadStart = action(() => {
    console.time('load');
    this.timer.start();
  });

  loadEnd = action(() => {
    console.timeEnd('load');
  });

  /**
   * Add the features of one parsed chunk. The first feature of a load first calls
   * `onFirstRecord` (the owner's commit, which clears the previous data) in the same
   * action, then marks the store as loading again (the clear reset that flag).
   */
  private addFileFeatures(
    features: GeometryFeature[],
    state: { received: number },
    onFirstRecord?: () => void,
  ) {
    runInAction(() => {
      for (const feature of features) {
        if (state.received === 0) {
          onFirstRecord?.();
          this.setIsLoading();
        }
        ++state.received;
        this.addFeature(feature);
      }
    });
  }

  /**
   * End a file load. Nothing received: the previous data stays as it was (no binning, no
   * Infomap) and the load rejects with `emptyMessage`, unless it was cancelled. A worker
   * error after the first record keeps what arrived and rejects after `postLoad`.
   */
  private async finishFileLoad(
    state: { received: number },
    failure: unknown,
    wasLoaded: boolean,
    signal: AbortSignal | undefined,
    emptyMessage: string,
  ): Promise<FileLoadResult> {
    this.loadEnd();
    if (state.received === 0) {
      runInAction(() => {
        this.loadController = null;
        this.setIsLoaded(wasLoaded);
      });
      if (failure) throw failure;
      if (signal?.aborted) return { received: 0 };
      throw new Error(emptyMessage);
    }
    await this.postLoad();
    if (failure) throw failure;
    return { received: state.received };
  }

  /**
   * Load point records from CSV text (the documentation demo). Clears nothing itself:
   * `onFirstRecord` (the owner's commit) runs with the first record.
   */
  async loadString(
    data: string,
    {
      nameColumn = 'species',
      longColumn = 'longitude',
      latColumn = 'latitude',
      onFirstRecord,
    }: FileLoadOptions = {},
  ): Promise<FileLoadResult> {
    const wasLoaded = this.loaded;
    this.preLoad();
    const signal = this.loadController?.signal;
    const state = { received: 0 };
    const mapper = createMapper<string | undefined>(nameColumn, longColumn, latColumn);
    const features = csvParse(data).map((item) => {
      const mappedItem = mapper(item);
      return createPointFeature([mappedItem.longitude, mappedItem.latitude], {
        name: normalizeSpeciesName(mappedItem.name),
      });
    });
    this.addFileFeatures(features, state, onFirstRecord);
    return this.finishFileLoad(state, null, wasLoaded, signal, NO_USABLE_ROWS);
  }

  /**
   * Load a CSV/TSV file (or a zipped shapefile, by its `.zip` name) in the data worker.
   * Clears nothing itself: `onFirstRecord` (the owner's commit) runs with the first
   * record. Rejects on a worker error and when no row has a usable name.
   */
  async load(
    file: string | File,
    {
      nameColumn = 'species',
      longColumn = 'longitude',
      latColumn = 'latitude',
      onFirstRecord,
    }: FileLoadOptions = {},
  ): Promise<FileLoadResult> {
    const filename = typeof file === 'string' ? file : file.name;
    if (filename.toLowerCase().endsWith('.zip')) {
      return this.loadShapefile(file, { onFirstRecord });
    }

    const wasLoaded = this.loaded;
    this.preLoad();
    const signal = this.loadController?.signal;
    const state = { received: 0 };

    const { mapStore } = this.rootStore;
    const mapper = createMapper(nameColumn, longColumn, latColumn);
    let ignoredRows = 0;

    let failure: unknown = null;
    try {
      await this.loadData(file, (items) => {
        const features: PointFeature[] = [];
        for (const item of items) {
          const mappedItem = mapper(item);
          const name = normalizeSpeciesName(mappedItem.name);
          if (!name || name === 'NA') {
            ++ignoredRows;
            continue;
          }
          features.push(createPointFeature([mappedItem.longitude, mappedItem.latitude], { name }));
        }
        if (features.length === 0) return;
        this.addFileFeatures(features, state, onFirstRecord);
        const multiPoint: MultiPoint = {
          type: 'MultiPoint',
          coordinates: features.map((feature) => feature.geometry.coordinates),
        };
        this.multiPointCollection.geometries.push(multiPoint);
        mapStore.renderMultiPoint(multiPoint);
      });
    } catch (error) {
      failure = error;
    }
    if (ignoredRows > 0) {
      console.log(`Ignored ${ignoredRows} rows due to no name`);
    }

    return this.finishFileLoad(state, failure, wasLoaded, signal, NO_USABLE_ROWS);
  }

  /**
   * Load a zipped shapefile (or its .shp/.dbf files) in the data worker. Clears nothing
   * itself: `onFirstRecord` (the owner's commit) runs with the first feature. Rejects on
   * a worker error and when the shapefile holds no feature.
   */
  async loadShapefile(
    file: string | File | File[],
    { nameKey, onFirstRecord }: { nameKey?: string; onFirstRecord?: () => void } = {},
  ): Promise<FileLoadResult> {
    const wasLoaded = this.loaded;
    this.preLoad();
    const signal = this.loadController?.signal;
    const state = { received: 0 };
    let failure: unknown = null;
    try {
      await this.loadShapefileInWorker(
        file,
        (features) => this.addFileFeatures(features, state, onFirstRecord),
        nameKey,
      );
    } catch (error) {
      failure = error;
    }
    return this.finishFileLoad(state, failure, wasLoaded, signal, NO_SHAPEFILE_FEATURES);
  }

  /**
   * Stream parsed point records (e.g. from GBIF or OBIS) into the store, drawing each
   * batch as it arrives, then bin and run Infomap like `load`. Cancelling (through
   * `controller` or `cancelLoad`) stops reading and keeps the records received so far.
   * A failing stream also keeps them, and the error is rethrown after `postLoad`.
   * Aborting `controller` with the reason `'discard'` drops the records instead and
   * skips binning and Infomap.
   *
   * `onFirstRecord` runs in the same action as the first record, before it is added: the
   * data owner's commit, which clears the previous data. When no record arrives at all
   * (or the load is discarded before one does), the previous dataset is left untouched
   * and neither `postLoad` nor Infomap runs; the result reports `received: 0`. A discard
   * after the first record skips binning and Infomap and leaves the clearing to the owner.
   *
   * `skipBioregions` is asked once the stream has ended (records arrived, not discarded):
   * when it returns true the records are binned and kept on the map's record layer, but
   * Infomap does not run (stale bioregions are cleared); `runBioregions()` runs it later.
   */
  async loadRecords(
    batches: AsyncIterable<{ name: string; lon: number; lat: number }[]>,
    {
      controller = new AbortController(),
      skipBioregions,
      onFirstRecord,
    }: {
      controller?: AbortController;
      skipBioregions?: () => boolean;
      /** The data owner's commit, called once in the same action as the first record. */
      onFirstRecord?: () => void;
    } = {},
  ): Promise<LoadRecordsResult> {
    // Restored when nothing arrives, so a dataset that is kept stays marked as loaded.
    const wasLoaded = this.loaded;
    this.preLoad(controller);

    const { mapStore } = this.rootStore;
    let received = 0;
    let failure: unknown = null;
    try {
      for await (const batch of batches) {
        if (controller.signal.aborted) {
          break;
        }
        if (batch.length === 0) {
          continue;
        }
        const first = received === 0;
        const multiPoint: MultiPoint = { type: 'MultiPoint', coordinates: [] };
        runInAction(() => {
          if (first) {
            // First record: only now does the data owner replace the previous dataset.
            onFirstRecord?.();
            this.setIsLoading();
          }
          received += batch.length;
          for (const record of batch) {
            const pointFeature = createPointFeature([record.lon, record.lat], {
              name: record.name,
            });
            this.addFeature(pointFeature);
            multiPoint.coordinates.push(pointFeature.geometry.coordinates);
          }
          this.multiPointCollection.geometries.push(multiPoint);
        });
        if (first) mapStore.setRenderType('records');
        mapStore.renderMultiPoint(multiPoint);
      }
    } catch (error) {
      if (!isAbortError(error)) {
        failure = error;
      }
    }

    this.loadEnd();
    if (controller.signal.reason === 'discard' && received > 0) {
      // Discarded after the commit: skip binning and Infomap; the data owner removes the records.
      runInAction(() => {
        this.loadController = null;
        this.setIsLoaded(false);
      });
      return { received };
    }
    if (received === 0) {
      // Nothing arrived: keep the previous dataset as it was and skip binning and Infomap.
      runInAction(() => {
        this.loadController = null;
        this.setIsLoaded(wasLoaded);
      });
      // A discard before the first record is not a failure.
      if (failure && controller.signal.reason !== 'discard') {
        throw failure;
      }
      return { received };
    }
    if (skipBioregions?.()) {
      this.finishWithoutBioregions();
    } else {
      await this.postLoad();
    }
    if (failure) {
      throw failure;
    }
    return { received };
  }

  /** Like `postLoad` without Infomap: bin the records and keep the record layer on the map. */
  finishWithoutBioregions = action(() => {
    this.loadController = null;
    this.loadEnd();
    this.updateCollection();
    this.setIsLoaded();
    const { mapStore, infomapStore } = this.rootStore;
    // Bioregions of an earlier dataset no longer describe these records.
    infomapStore.clearData();
    mapStore.setRenderType('records');
    mapStore.render();
  });

  /** Run Infomap on the loaded records (after `skipBioregions`) and show the bioregions. */
  runBioregions = action(async () => {
    const { mapStore, infomapStore } = this.rootStore;
    if (!this.loaded) return;
    mapStore.setRenderType('heatmap');
    mapStore.render();
    if (!(await infomapStore.run())) return;
    mapStore.setRenderType('bioregions');
    mapStore.render();
  });

  /** Stop the running load; it finishes with the records received so far. */
  cancelLoad = action(() => {
    this.loadController?.abort();
  });

  preLoad = action((controller: AbortController = new AbortController()) => {
    this.loadController = controller;
    this.setIsLoading();
    this.loadStart();
  });

  postLoad = action(async () => {
    this.loadController = null;
    this.loadEnd();
    this.updateCollection();
    this.setIsLoaded();

    const { mapStore, infomapStore } = this.rootStore;
    mapStore.setRenderType('heatmap');
    mapStore.render();
    if (!(await infomapStore.run())) return;
    mapStore.setRenderType('bioregions');
    mapStore.render();
  });

  generateGeojsonFromBins = () => {
    const features = this.binner.cells.map((cell, index) => {
      const c = Color(cell.color);
      if (c == null) {
        // `d3.color` returns null for an unparseable specifier; a bare `!` here would
        // have thrown on the property access below, so fail explicitly instead.
        throw new Error(`Invalid cell color: ${cell.color}`);
      }
      return {
        type: "Feature",
        geometry: cell.geometry,
        properties: {
          id: cell.id,
          index,
          bioregion: cell.bioregionId + 1,
          recordsCount: cell.numFeatures,
          speciesCount: cell.speciesTopList.length,
          color: c.formatHex(),
          opacity: Math.round(c.opacity * 100),
        }
      }
    });

    return {
      type: "FeatureCollection",
      features
    };
  }

  generatePresenceAbsenceDataPerCell = () => {
    // Enumerates cells with same 'index' property as in GeoJSON/Shapefile output
    const numCells = this.binner.cells.length;
    const data = new Map<string, string[]>(); // species -> presenceAbsence
    this.speciesMap.forEach(value => {
      data.set(value.name, new Array(numCells).fill("0"));
    });
    this.binner.cells.forEach((cell, i) => {
      cell.speciesTopList.forEach(d => {
        const presenceAbsence = data.get(d.name);
        if (presenceAbsence === undefined) {
          throw new Error(`No presence/absence row for species: ${d.name}`);
        }
        presenceAbsence[i] = "1";
      })
    })
    return Array.from(data, ([name, value]) => `${name}\t${value.join("")}`).join("\n");
  }

  generatePresenceAbsenceDataPerBioregion = () => {
    const { numBioregions } = this.rootStore.infomapStore;
    const data = new Map<string, string[]>(); // species -> presenceAbsence
    this.speciesMap.forEach(value => {
      data.set(value.name, new Array(numBioregions).fill("0"));
    });
    this.binner.cells.forEach(cell => {
      cell.speciesTopList.forEach(d => {
        const presenceAbsence = data.get(d.name);
        if (presenceAbsence === undefined) {
          throw new Error(`No presence/absence row for species: ${d.name}`);
        }
        presenceAbsence[cell.bioregionId - 1] = "1";
      })
    })
    return Array.from(data, ([name, value]) => `${name}\t${value.join("")}`).join("\n");
  }

  generateSummaryTabularDataPerBioregion = (maxNumRows?: number) => {
    const { infomapStore, colorStore } = this.rootStore;
    const { bioregions } = infomapStore;
    const { colorBioregion } = colorStore;

    const header = [
      "bioregion",
      "rank_in_bioregion",
      "common_species_name",
      "common_species_count",
      "common_species_score",
      "indicative_species_name",
      "indicative_species_count",
      "indicative_species_score",
      "bioregion_color",
    ];
    const data = [header];

    bioregions.forEach(bioregion => {

      const MAX_NUM_ROWS = maxNumRows ?? 10;
      const numValues = Math.min(
        Math.min(bioregion.mostCommon.length, bioregion.mostIndicative.length),
        MAX_NUM_ROWS,
      );

      const mostCommon = bioregion.mostCommon.slice(0, numValues);
      const mostIndicative = bioregion.mostIndicative.slice(0, numValues);


      mostCommon.forEach(
        (
          commonSpecies: { name: string; count: number; score: number },
          index: number,
        ) => {
          const indicativeSpecies = mostIndicative[index];
          data.push([
            bioregion.bioregionId,
            index + 1,
            commonSpecies.name,
            commonSpecies.count,
            commonSpecies.score,
            indicativeSpecies.name,
            indicativeSpecies.count,
            indicativeSpecies.score,
            Color(colorBioregion(bioregion.bioregionId))?.formatHex(),
          ].map(value => `${value}`))
        }
      )
    });

    return tsvFormatRows(data);
  }

  generateFullTabularDataPerBioregion = () => {
    const { infomapStore, colorStore } = this.rootStore;
    const { bioregions } = infomapStore;
    const { colorBioregion } = colorStore;

    const header = [
      "bioregion",
      "species_name",
      "count",
      "indicative_score",
      "bioregion_color",
    ];
    const data = [header];

    bioregions.forEach(bioregion => {
      bioregion.mostCommon.forEach(
        (
          commonSpecies: { name: string; count: number; score: number },
        ) => {
          data.push([
            bioregion.bioregionId,
            commonSpecies.name,
            commonSpecies.count,
            commonSpecies.score,
            Color(colorBioregion(bioregion.bioregionId))?.formatHex(),
          ].map(value => `${value}`))
        }
      )
    });

    return tsvFormatRows(data);
  }

}

function createMapper<ItemType = string | number>(
  nameColumn: string,
  longColumn: string,
  latColumn: string,
) {
  return (item: { [key: string]: ItemType }) => ({
    name: `${item[nameColumn]}`,
    longitude: +item[longColumn],
    latitude: +item[latColumn],
  });
}
