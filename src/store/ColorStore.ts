import { makeObservable, observable, action, computed } from 'mobx';
import * as c3 from '@mapequation/c3';
import type { SchemeName as c3SchemeName } from '@mapequation/c3';
import type RootStore from './RootStore';
import type { Cell } from '../utils/QuadTree';
import { color as Color, interpolateRgb } from 'd3';

// `d3.color` returns null for an unparseable color specifier. The call sites below
// previously used a non-null assertion (`!`) and would have thrown on the subsequent
// property access; this helper preserves that "throw on null" behavior with a clearer
// message while keeping a non-nullable return type.
type D3Color = NonNullable<ReturnType<typeof Color>>;
const requireColor = (specifier: string): D3Color => {
  const color = Color(specifier);
  if (color == null) {
    throw new Error(`Invalid color specifier: ${specifier}`);
  }
  return color;
};

export type SchemeName = c3SchemeName | 'Mural';

export const COLOR_SCHEMES = [
  { label: 'Sinebow', value: 'Sinebow' },
  { label: 'Rainbow', value: 'Rainbow' },
  { label: 'Turbo', value: 'Turbo' },
  { label: 'Viridis', value: 'Viridis' },
  { label: 'Greys', value: 'Greys' },
  { label: 'Mural', value: 'Mural' },
];

// Englewood mural (5 first from a plugin to Illustrator, extended with glasbey)
const MURAL_COLORS = [
  "#afb581",
  "#efab6a",
  "#e78c6e",
  "#838eab",
  "#c4c0d5",
  "#55c2ba",
  "#55a26d",
  "#ae8635",
  "#8acaf3",
  "#82d79e",
  "#a68679",
  "#a6aaef",
  "#419eb2",
  "#8aa29e",
  "#aacac2",
  "#ceaa9e",
  "#8a9a45",
  "#35a292",
  "#8a9275",
  "#75a6d7",
  "#d7be61",
  "#9eb6c6",
  "#86ba71",
  "#c29669",
  "#79b696",
  "#b2ce75",
  "#8e8ace",
  "#a6a2c2",
  "#c67551",
  "#69b6ca",
  "#d7be92",
  "#b2a24d",
  "#79d2df",
  "#aec2ef",
  "#aecaa6",
  "#79d7be",
  "#f3aa92",
  "#7596a2",
  "#9aae96",
  "#719a82",
  "#69aaaa",
  "#a28a5d",
  "#82a26d",
  "#aea282",
  "#d2a251",
  "#8ebaba",
  "#a6b65d",
  "#8aa2ba",
  "#7592ca",
  "#9a9a61",
];

export class CellColor {
  color: string = "#cccccc";
  firstColor: string = "#cccccc";
  secondColor: string = "#cccccc";
  t: number = 0.0;
  opacity: number = 1.0;

  constructor(
    firstColor = "#cccccc",
    secondColor = "#cccccc",
    t = 0.0,
    opacity = 1.0,
  ) {
    this.firstColor = firstColor;
    this.secondColor = secondColor;
    this.t = t;
    this.opacity = opacity;
  }

  generateColor(colorModuleParticipationStrength = 1) {
    const color = requireColor(interpolateRgb(this.secondColor, this.firstColor)(this.t ** colorModuleParticipationStrength));
    color.opacity = this.opacity ** colorModuleParticipationStrength;
    return color.toString();
  }
}

export default class ColorStore {
  rootStore: RootStore;

  scheme: SchemeName = 'Turbo';
  saturation: number = 0.55;
  saturationEnd: number = 0.8;
  lightness: number = 0.5;
  lightnessEnd: number = 0.5;
  midpoint: number = 4.5;
  steepness: number = 1;
  strength: number = 0;
  offset: number = 0;
  reverse: boolean = false;
  useFlow: boolean = true;
  hideDominantOverlappingModule: boolean = false;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    makeObservable(this, {
      scheme: observable,
      saturation: observable,
      setSaturation: action,
      saturationEnd: observable,
      setSaturationEnd: action,
      lightness: observable,
      setLightness: action,
      lightnessEnd: observable,
      setLightnessEnd: action,
      midpoint: observable,
      setMidpoint: action,
      steepness: observable,
      setSteepness: action,
      strength: observable,
      offset: observable,
      reverse: observable,
      useFlow: observable,
      setScheme: action,
      setStrength: action,
      setOffset: action,
      setReverse: action,
      setUseFlow: action,
      toggleReverse: action,
      toggleUseFlow: action,
      bioregionColors: computed,
    });
  }

  get bioregionColors(): string[] {
    const { bioregions, numBioregions } = this.rootStore.infomapStore;
    const colorData = this.useFlow
      ? bioregions.map((r) => r.flow)
      : numBioregions;

    if (this.scheme === 'Mural') {
      if (numBioregions <= MURAL_COLORS.length) {
        return MURAL_COLORS;
      }

      // Extend from c3 if more colors are needed
      const c3colors = c3.colors(colorData, {
        saturation: this.saturation,
        saturationEnd: this.saturationEnd,
        lightness: this.lightness,
        lightnessEnd: this.lightnessEnd,
        midpoint: this.midpoint,
        steepness: this.steepness,
        scheme: "Turbo",
        offset: this.offset,
        reverse: this.reverse,
        strength: this.strength,
      });
      return MURAL_COLORS.concat(c3colors.slice(MURAL_COLORS.length, numBioregions));
    }

    const colors = c3.colors(colorData, {
      saturation: this.saturation,
      saturationEnd: this.saturationEnd,
      lightness: this.lightness,
      lightnessEnd: this.lightnessEnd,
      midpoint: this.midpoint,
      steepness: this.steepness,
      scheme: this.scheme,
      offset: this.offset,
      reverse: this.reverse,
      strength: this.strength,
    });
    return colors;
  }

  get colorBioregion() {
    return (bioregionId: number) => this.bioregionColors[bioregionId - 1];
  }

  getCellColorData = (cell: Cell) => {
    const { colorBioregion } = this;
    if (this.rootStore.mapStore.colorModuleParticipation) {
      const { colorModuleParticipationStrength } = this.rootStore.mapStore;

      if (cell.overlappingBioregions.size <= 1) {
        if (cell.connectedBioregions.size <= 1) {
          return colorBioregion(cell.bioregionId);
        }
        const {
          topBioregionId,
          topBioregionProportion,
          secondBioregionId,
          secondBioregionProportion,
          ownProportion
        } = cell.connectedBioregions;
        let t =
          topBioregionProportion /
          (topBioregionProportion + secondBioregionProportion);
        if (topBioregionId !== cell.bioregionId) {
          // const c = Color("black")!
          // c.opacity = ownProportion;
          // return c.toString();
          const firstColor = colorBioregion(cell.bioregionId);
          const secondColor = colorBioregion(topBioregionId);
          t = ownProportion / (ownProportion + topBioregionProportion)
          const color = requireColor(interpolateRgb(secondColor, firstColor)(t ** colorModuleParticipationStrength));
          color.opacity = topBioregionProportion ** colorModuleParticipationStrength;
          return new CellColor(firstColor, secondColor, t, color.opacity);
        }
        const firstColor = colorBioregion(topBioregionId);
        const secondColor = colorBioregion(secondBioregionId);
        const color = requireColor(interpolateRgb(secondColor, firstColor)(t ** colorModuleParticipationStrength));
        color.opacity = topBioregionProportion ** colorModuleParticipationStrength;
        return color.toString();
      }
      // Add colors from all overlapping bioregions weighted on opacity
      // Let final opacity be half-transparent to signal overlapping bioregions
      const {
        topBioregionId,
        topBioregionProportion,
        secondBioregionId,
        secondBioregionProportion,
      } = cell.overlappingBioregions;
      if (this.hideDominantOverlappingModule) {
        const color = requireColor(colorBioregion(secondBioregionId));
        color.opacity = secondBioregionProportion;// / (1 - topBioregionProportion);
        return color.toString();
      }
      const t =
        topBioregionProportion /
        (topBioregionProportion + secondBioregionProportion);
      const firstColor = colorBioregion(topBioregionId);
      const secondColor = colorBioregion(secondBioregionId);
      const color = requireColor(interpolateRgb(secondColor, firstColor)(t));
      color.opacity = topBioregionProportion;
      return color.toString();
    }

    if (cell.overlappingBioregions.size <= 1) {
      return colorBioregion(cell.bioregionId);
    }
    // Add colors from all overlapping bioregions weighted on opacity
    // Let final opacity be half-transparent to signal overlapping bioregions
    const {
      topBioregionId,
      topBioregionProportion,
      secondBioregionId,
      secondBioregionProportion,
    } = cell.overlappingBioregions;
    if (this.hideDominantOverlappingModule) {
      const color = requireColor(colorBioregion(secondBioregionId));
      color.opacity = secondBioregionProportion;// / (1 - topBioregionProportion);
      return color.toString();
    }
    const t =
      topBioregionProportion /
      (topBioregionProportion + secondBioregionProportion);
    const firstColor = colorBioregion(topBioregionId);
    const secondColor = colorBioregion(secondBioregionId);
    const color = requireColor(interpolateRgb(secondColor, firstColor)(t));
    color.opacity = topBioregionProportion;
    return color.toString();
  }

  get colorCell() {
    const { colorBioregion } = this;
    if (this.rootStore.mapStore.colorModuleParticipation) {
      const { colorModuleParticipationStrength } = this.rootStore.mapStore;
      return (cell: Cell) => {
        if (cell.overlappingBioregions.size <= 1) {
          if (cell.connectedBioregions.size <= 1) {
            cell.color = colorBioregion(cell.bioregionId);
            return cell.color;
          }
          const {
            topBioregionId,
            topBioregionProportion,
            secondBioregionId,
            secondBioregionProportion,
            ownProportion
          } = cell.connectedBioregions;
          let t =
            topBioregionProportion /
            (topBioregionProportion + secondBioregionProportion);
          if (topBioregionId !== cell.bioregionId) {
            // const c = Color("black")!
            // c.opacity = ownProportion;
            // return c.toString();
            const firstColor = colorBioregion(cell.bioregionId);
            const secondColor = colorBioregion(topBioregionId);
            t = ownProportion / (ownProportion + topBioregionProportion)
            const color = requireColor(interpolateRgb(secondColor, firstColor)(t ** colorModuleParticipationStrength));
            color.opacity = topBioregionProportion ** colorModuleParticipationStrength;
            cell.color = color.toString();
            return cell.color;
          }
          const firstColor = colorBioregion(topBioregionId);
          const secondColor = colorBioregion(secondBioregionId);
          const color = requireColor(interpolateRgb(secondColor, firstColor)(t ** colorModuleParticipationStrength));
          color.opacity = topBioregionProportion ** colorModuleParticipationStrength;
          cell.color = color.toString();
          return cell.color;
        }
        // Add colors from all overlapping bioregions weighted on opacity
        // Let final opacity be half-transparent to signal overlapping bioregions
        const {
          topBioregionId,
          topBioregionProportion,
          secondBioregionId,
          secondBioregionProportion,
        } = cell.overlappingBioregions;
        if (this.hideDominantOverlappingModule) {
          const color = requireColor(colorBioregion(secondBioregionId));
          color.opacity = secondBioregionProportion;// / (1 - topBioregionProportion);
          cell.color = color.toString();
          return cell.color;
        }
        const t =
          topBioregionProportion /
          (topBioregionProportion + secondBioregionProportion);
        const firstColor = colorBioregion(topBioregionId);
        const secondColor = colorBioregion(secondBioregionId);
        const color = requireColor(interpolateRgb(secondColor, firstColor)(t));
        color.opacity = topBioregionProportion;
        cell.color = color.toString();
        return cell.color;
      };
    }
    return (cell: Cell) => {
      if (cell.overlappingBioregions.size <= 1) {
        cell.color = colorBioregion(cell.bioregionId);
        return cell.color;
      }
      // Add colors from all overlapping bioregions weighted on opacity
      // Let final opacity be half-transparent to signal overlapping bioregions
      const {
        topBioregionId,
        topBioregionProportion,
        secondBioregionId,
        secondBioregionProportion,
      } = cell.overlappingBioregions;
      if (this.hideDominantOverlappingModule) {
        const color = requireColor(colorBioregion(secondBioregionId));
        color.opacity = secondBioregionProportion;// / (1 - topBioregionProportion);
        cell.color = color.toString();
        return cell.color;
      }
      const t =
        topBioregionProportion /
        (topBioregionProportion + secondBioregionProportion);
      const firstColor = colorBioregion(topBioregionId);
      const secondColor = colorBioregion(secondBioregionId);
      const color = requireColor(interpolateRgb(secondColor, firstColor)(t));
      color.opacity = topBioregionProportion;
      cell.color = color.toString();
      return cell.color;
    };
  }

  setScheme = (value: SchemeName) => {
    this.scheme = value;
  };
  setSaturation = (value: number) => {
    this.saturation = value;
  };
  setSaturationEnd = (value: number) => {
    this.saturationEnd = value;
  };
  setSaturationRange = action((value: [number, number]) => {
    this.saturation = value[0];
    this.saturationEnd = value[1];
  })
  setLightness = (value: number) => {
    this.lightness = value;
  };
  setLightnessEnd = (value: number) => {
    this.lightnessEnd = value;
  };
  setLightnessRange = action((value: [number, number]) => {
    this.lightness = value[0];
    this.lightnessEnd = value[1];
  })
  setMidpoint = (value: number) => {
    this.midpoint = value;
  };
  setSteepness = (value: number) => {
    this.steepness = value;
  };
  setStrength = (value: number) => {
    this.strength = value;
  };
  setOffset = (value: number) => {
    this.offset = value;
  };
  setReverse = (value: boolean) => {
    this.reverse = value;
  };
  setUseFlow = (value: boolean) => {
    this.useFlow = value;
  };
  toggleReverse = () => {
    this.reverse = !this.reverse;
  };
  toggleUseFlow = () => {
    this.useFlow = !this.useFlow;
  };
  toggleHideDominantOverlappingModule = () => {
    this.hideDominantOverlappingModule = !this.hideDominantOverlappingModule;
  }
}
