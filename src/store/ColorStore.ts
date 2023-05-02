import { makeObservable, observable, action, computed } from 'mobx';
import * as c3 from '@mapequation/c3';
import type { SchemeName } from '@mapequation/c3';
import type RootStore from './RootStore';
import { Cell } from '../utils/QuadTree';
import { color as Color, interpolateRgb } from 'd3';

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
    const color = Color(interpolateRgb(this.secondColor, this.firstColor)(this.t ** colorModuleParticipationStrength))!;
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
          const color = Color(interpolateRgb(secondColor, firstColor)(t ** colorModuleParticipationStrength))!;
          color.opacity = topBioregionProportion ** colorModuleParticipationStrength;
          return new CellColor(firstColor, secondColor, t, color.opacity);
        }
        const firstColor = colorBioregion(topBioregionId);
        const secondColor = colorBioregion(secondBioregionId);
        const color = Color(interpolateRgb(secondColor, firstColor)(t ** colorModuleParticipationStrength))!;
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
        const color = Color(colorBioregion(secondBioregionId))!;
        color.opacity = secondBioregionProportion;// / (1 - topBioregionProportion);
        return color.toString();
      }
      const t =
        topBioregionProportion /
        (topBioregionProportion + secondBioregionProportion);
      const firstColor = colorBioregion(topBioregionId);
      const secondColor = colorBioregion(secondBioregionId);
      const color = Color(interpolateRgb(secondColor, firstColor)(t))!;
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
      const color = Color(colorBioregion(secondBioregionId))!;
      color.opacity = secondBioregionProportion;// / (1 - topBioregionProportion);
      return color.toString();
    }
    const t =
      topBioregionProportion /
      (topBioregionProportion + secondBioregionProportion);
    const firstColor = colorBioregion(topBioregionId);
    const secondColor = colorBioregion(secondBioregionId);
    const color = Color(interpolateRgb(secondColor, firstColor)(t))!;
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
            const color = Color(interpolateRgb(secondColor, firstColor)(t ** colorModuleParticipationStrength))!;
            color.opacity = topBioregionProportion ** colorModuleParticipationStrength;
            cell.color = color.toString();
            return cell.color;
          }
          const firstColor = colorBioregion(topBioregionId);
          const secondColor = colorBioregion(secondBioregionId);
          const color = Color(interpolateRgb(secondColor, firstColor)(t ** colorModuleParticipationStrength))!;
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
          const color = Color(colorBioregion(secondBioregionId))!;
          color.opacity = secondBioregionProportion;// / (1 - topBioregionProportion);
          cell.color = color.toString();
          return cell.color;
        }
        const t =
          topBioregionProportion /
          (topBioregionProportion + secondBioregionProportion);
        const firstColor = colorBioregion(topBioregionId);
        const secondColor = colorBioregion(secondBioregionId);
        const color = Color(interpolateRgb(secondColor, firstColor)(t))!;
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
        const color = Color(colorBioregion(secondBioregionId))!;
        color.opacity = secondBioregionProportion;// / (1 - topBioregionProportion);
        cell.color = color.toString();
        return cell.color;
      }
      const t =
        topBioregionProportion /
        (topBioregionProportion + secondBioregionProportion);
      const firstColor = colorBioregion(topBioregionId);
      const secondColor = colorBioregion(secondBioregionId);
      const color = Color(interpolateRgb(secondColor, firstColor)(t))!;
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
  setLightness = (value: number) => {
    this.lightness = value;
  };
  setLightnessEnd = (value: number) => {
    this.lightnessEnd = value;
  };
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
