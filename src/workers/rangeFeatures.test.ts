import { describe, expect, it } from 'vitest';
import { GEOJSON_COPY, parseGeoJsonRanges } from './rangeFeatures';

const square = [
  [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
    [0, 0],
  ],
];
const feature = (properties: Record<string, unknown> | null, geometry: unknown) => ({
  type: 'Feature',
  properties,
  geometry,
});
const collection = (...features: unknown[]) => JSON.stringify({ type: 'FeatureCollection', features });

describe('parseGeoJsonRanges', () => {
  it('reads Polygon features and names them from binomial', () => {
    const text = collection(feature({ binomial: 'Betula pendula', id: 7 }, { type: 'Polygon', coordinates: square }));
    const [ranged] = parseGeoJsonRanges(text, 'r.geojson');
    expect(ranged.geometry).toEqual({ type: 'Polygon', coordinates: square });
    expect(ranged.properties).toMatchObject({ name: 'Betula pendula', binomial: 'Betula pendula' });
  });

  it('splits MultiPolygon and MultiPoint features', () => {
    const text = collection(
      feature({ species: 'A a' }, { type: 'MultiPolygon', coordinates: [square, square] }),
      feature({ species: 'B b' }, { type: 'MultiPoint', coordinates: [[1, 2], [3, 4]] }),
    );
    const features = parseGeoJsonRanges(text, 'r.geojson');
    expect(features.map((f) => [f.geometry.type, f.properties.name])).toEqual([
      ['Polygon', 'A a'],
      ['Polygon', 'A a'],
      ['Point', 'B b'],
      ['Point', 'B b'],
    ]);
  });

  it('reads a single Feature and honours nameKey', () => {
    const text = JSON.stringify(feature({ taxon: 'C c', name: 'x' }, { type: 'Point', coordinates: [5, 6] }));
    const features = parseGeoJsonRanges(text, 'r.json', 'taxon');
    expect(features).toHaveLength(1);
    expect(features[0].properties.name).toBe('C c');
  });

  it.each([
    ['not json', GEOJSON_COPY.invalidJson('r.json')],
    ['[1, 2]', GEOJSON_COPY.notGeoJson('r.json', 'an array')],
    ['{"a": 1}', GEOJSON_COPY.notGeoJson('r.json', 'no GeoJSON type')],
    ['{"type": "Polygon", "coordinates": []}', GEOJSON_COPY.notGeoJson('r.json', "type 'Polygon'")],
    [collection(), GEOJSON_COPY.noFeatures('r.json')],
  ])('rejects %s', (text, message) => {
    expect(() => parseGeoJsonRanges(text, 'r.json')).toThrow(message);
  });

  it('rejects features without a species key or with other geometry', () => {
    const line = { type: 'LineString', coordinates: [[0, 0], [1, 1]] };
    const polygon = { type: 'Polygon', coordinates: square };
    expect(() => parseGeoJsonRanges(collection(feature({ area: 1 }, polygon)), 'r.json')).toThrow(
      /name key in GeoJSON/,
    );
    expect(() =>
      parseGeoJsonRanges(collection(feature({ name: 'A a' }, polygon), feature({ name: 'B b' }, line)), 'r.json'),
    ).toThrow("Unsupported geometry 'LineString' in r.json (feature index 1)");
  });

  it('names species from numeric ids', () => {
    const polygon = { type: 'Polygon', coordinates: square };
    const ranges = parseGeoJsonRanges(collection(feature({ id: 42 }, polygon), feature({ id: 7 }, polygon)), 'r.json');
    expect(ranges.map((f) => f.properties.name)).toEqual(['42', '7']);
  });

  it('skips features without geometry', () => {
    const polygon = { type: 'Polygon', coordinates: square };
    const ranges = parseGeoJsonRanges(
      collection(feature({ name: 'A a' }, null), null, feature({ name: 'B b' }, polygon)),
      'r.json',
    );
    expect(ranges.map((f) => f.properties.name)).toEqual(['B b']);
    expect(() => parseGeoJsonRanges(collection(feature({ name: 'A a' }, null)), 'r.json')).toThrow(
      GEOJSON_COPY.noFeatures('r.json'),
    );
  });
});
