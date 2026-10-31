// InfomapStore.run with too few records for one grid cell, through the headless root.
import { describe, expect, it } from 'vitest';
import { createHeadlessRoot, setOccurrences } from '../../harness/stubRoot';
import { createPointFeature } from './SpeciesStore';

describe('InfomapStore.run without grid cells', () => {
  it('reports no run and records the cell capacity for the hint', async () => {
    const root = createHeadlessRoot();
    root.speciesStore.binner.setMinCellCapacity(10);
    setOccurrences(root, [createPointFeature([10, 10], { name: 'Aa a' }), createPointFeature([11, 11], { name: 'Bb b' })]);
    const { infomapStore } = root;
    expect(root.speciesStore.binner.cells).toHaveLength(0);
    await expect(infomapStore.run()).resolves.toBe(false);
    expect(infomapStore.noCellsCapacity).toBe(10);
    await expect(infomapStore.runMultilayer()).resolves.toBe(false);
    expect(infomapStore.isRunning).toBe(false);
  });
});
