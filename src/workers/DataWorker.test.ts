import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

type Shape = {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: Record<string, unknown>;
};

let shapes: Shape[] = [];

vi.mock('shapefile', () => ({
  open: async () => {
    let i = 0;
    return {
      bbox: [-180, -90, 180, 90],
      read: async () =>
        i < shapes.length
          ? { done: false, value: shapes[i++] }
          : { done: true, value: undefined },
    };
  },
}));

const messages: { type: string; data?: Shape[]; status?: string }[] = [];
let onComplete = () => {};

beforeAll(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.stubGlobal('self', {});
  vi.stubGlobal('postMessage', (message: (typeof messages)[number]) => {
    messages.push(message);
    if (message.status === 'complete') onComplete();
  });
  await import('./DataWorker');
});

afterEach(() => {
  messages.length = 0;
});

const loadShapes = (shapesToLoad: Shape[]) => {
  shapes = shapesToLoad;
  const done = new Promise<void>((resolve) => {
    onComplete = resolve;
  });
  const files = [new File([''], 'ranges.shp'), new File([''], 'ranges.dbf')];
  const { onmessage } = self as unknown as {
    onmessage: (event: { data: unknown }) => void;
  };
  onmessage({ data: { type: 'LOAD_SHAPEFILE', file: files } });
  return done.then(() =>
    messages.flatMap((message) =>
      message.type === 'data' ? (message.data ?? []) : [],
    ),
  );
};

const shape = (name: unknown, i: number): Shape => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [i % 180, 0] },
  properties: { species: name },
});

describe('DataWorker shapefile loading', () => {
  it('posts every feature, including the last partial batch', async () => {
    const features = await loadShapes(
      Array.from({ length: 250 }, (_, i) => shape(`species_${i}`, i)),
    );

    expect(features).toHaveLength(250);
    expect(features[features.length - 1]?.properties.name).toBe('Species 249');
  });
});
