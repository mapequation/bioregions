/**
 * Tests for colouring bioregions and grid cells.
 */

import { describe, expect, it } from 'vitest';
import { Cell } from '../utils/QuadTree';
import ColorStore from './ColorStore';
import type RootStore from './RootStore';

/** The colour of cells without a bioregion, as in bioregions-py. */
const UNASSIGNED = '#ffcccc';

/** A colour store for two bioregions, colouring cells by participation or not. */
function colorStore(colorModuleParticipation = false) {
  const rootStore = {
    infomapStore: {
      bioregions: [{ flow: 0.6 }, { flow: 0.4 }],
      numBioregions: 2,
    },
    mapStore: { colorModuleParticipation, colorModuleParticipationStrength: 1 },
  } as unknown as RootStore;
  return new ColorStore(rootStore);
}

/** A grid cell without a bioregion (bioregion id 0). */
function unassignedCell() {
  return new Cell([-180, -90, 180, 90], 0);
}

describe('cells without a bioregion', () => {
  it('get the unassigned colour', () => {
    const store = colorStore();
    expect(store.colorBioregion(0)).toBe(UNASSIGNED);
    expect(store.colorCell(unassignedCell())).toBe(UNASSIGNED);
    expect(store.getCellColorData(unassignedCell())).toBe(UNASSIGNED);
  });

  it('get the unassigned colour when coloured by participation', () => {
    const store = colorStore(true);
    expect(store.colorCell(unassignedCell())).toBe(UNASSIGNED);
    expect(store.getCellColorData(unassignedCell())).toBe(UNASSIGNED);
  });

  it('leave the bioregion colours unchanged', () => {
    const store = colorStore();
    const colors = store.bioregionColors;
    expect(colors).toHaveLength(2);
    expect(store.colorBioregion(1)).toBe(colors[0]);
    expect(store.colorBioregion(2)).toBe(colors[1]);
    expect(colors).not.toContain(UNASSIGNED);
  });
});
