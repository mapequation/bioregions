// Range-polygon features shared by the shapefile and GeoJSON loads in DataWorker. Pure (no
// postMessage), so it runs without a Worker.
import * as turf from '@turf/turf';
import type { Feature, Geometry } from 'geojson';
import type { GeometryFeature, PointFeature, PolygonFeature } from '../store/SpeciesStore';
import { normalizeSpeciesName } from '../utils/names';

type InputFeature = Feature<Geometry | null, Record<string, unknown> | null>;

export const GEOJSON_COPY = {
  invalidJson: (name: string) => `${name} is not valid JSON`,
  notGeoJson: (name: string, type: string) =>
    `${name} is not GeoJSON range data: expected a FeatureCollection or a Feature, found ${type}`,
  noFeatures: (name: string) => `No features found in ${name}`,
  unsupportedGeometry: (name: string, type: string, index: number) =>
    `Unsupported geometry '${type}' in ${name} (feature index ${index}): expected Polygon, MultiPolygon, Point or MultiPoint`,
} as const;

/**
 * A function that splits one input feature into Polygon/Point features, each with its
 * species name in `properties.name`. The name key is `nameKey`, else the first of
 * `binomial`/`species`/`name`/`id` in the first feature's properties.
 */
export function rangeFeatureSplitter(source: string, nameKey?: string) {
  const keysToTest = ['binomial', 'species', 'name', 'id'] as const;
  let key = nameKey;
  return (feature: InputFeature): GeometryFeature[] => {
    if (key == null) {
      const keys = Object.keys(feature.properties ?? {});
      key = keysToTest.find((k) => keys.includes(k));
    }

    if (!feature.properties || !key) {
      throw new Error(`Can't deduce name key in ${source} from properties: ${JSON.stringify(feature.properties)}`);
    }

    // Numeric ids name species too; a missing value keeps the empty name it had.
    const raw = feature.properties[key];
    const properties = Object.assign(feature.properties, {
      name: normalizeSpeciesName(raw == null ? (raw as unknown as string) : String(raw)),
    });

    const geometry = feature.geometry;
    if (geometry?.type === 'MultiPolygon') {
      return geometry.coordinates.map((coords) => turf.polygon(coords, properties) as PolygonFeature);
    }
    if (geometry?.type === 'MultiPoint') {
      return geometry.coordinates.map((coords) => turf.point(coords, properties) as PointFeature);
    }
    if (geometry?.type === 'Polygon' || geometry?.type === 'Point') {
      return [feature as GeometryFeature];
    }
    throw new Error(`Unsupported geometry: '${geometry?.type ?? null}'`);
  };
}

const SUPPORTED_GEOMETRY = new Set(['Polygon', 'MultiPolygon', 'Point', 'MultiPoint']);

/**
 * The range features of a GeoJSON text (RFC 7946, lon/lat): a FeatureCollection or a
 * single Feature with Polygon/MultiPolygon or Point/MultiPoint geometry. `name` (the file
 * name) labels the errors.
 */
export function parseGeoJsonRanges(text: string, name: string, nameKey?: string): GeometryFeature[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(GEOJSON_COPY.invalidJson(name));
  }
  const type = (json as { type?: unknown } | null)?.type;
  let features: InputFeature[];
  if (type === 'FeatureCollection' && Array.isArray((json as { features?: unknown }).features)) {
    features = (json as { features: InputFeature[] }).features;
  } else if (type === 'Feature') {
    features = [json as InputFeature];
  } else {
    const found = typeof type === 'string' ? `type '${type}'` : Array.isArray(json) ? 'an array' : 'no GeoJSON type';
    throw new Error(GEOJSON_COPY.notGeoJson(name, found));
  }
  const split = rangeFeatureSplitter('GeoJSON', nameKey);
  const ranges: GeometryFeature[] = [];
  features.forEach((feature, i) => {
    // Null geometries (allowed by RFC 7946) and non-objects carry no range: skip them.
    if (feature === null || typeof feature !== 'object' || feature.geometry == null) return;
    const geometryType = (feature.geometry as { type?: unknown }).type;
    if (!SUPPORTED_GEOMETRY.has(geometryType as string)) {
      throw new Error(GEOJSON_COPY.unsupportedGeometry(name, String(geometryType), i));
    }
    ranges.push(...split(feature));
  });
  if (ranges.length === 0) {
    throw new Error(GEOJSON_COPY.noFeatures(name));
  }
  return ranges;
}
