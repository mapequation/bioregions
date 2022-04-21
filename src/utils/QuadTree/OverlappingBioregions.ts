export default class OverlappingBioregions {
  bioregionIds: Map<number, number> = new Map(); // bioregionId -> flow
  flow: number = 0.0; // total flow in cell
  memoryIdToBioregion: Map<string, number> = new Map();
  topBioregionId: number = 0;
  topBioregionProportion: number = 0;
  secondBioregionId: number = 0;
  secondBioregionProportion: number = 0;
  // color: string;

  addStateNode(bioregionId: number, flow: number, memoryId: string) {
    this.flow += flow;
    this.bioregionIds.set(
      bioregionId,
      (this.bioregionIds.get(bioregionId) ?? 0) + flow,
    );
    this.memoryIdToBioregion.set(memoryId, bioregionId);
  }

  calcTopBioregions() {
    // Calculate top
    let topFlow = 0;
    let topBioregionId = 0;
    let secondFlow = 0;
    let secondBioregionId = 0;
    this.bioregionIds.forEach((flow, bioregionId) => {
      if (flow > topFlow) {
        secondFlow = topFlow;
        secondBioregionId = topBioregionId;
        topFlow = flow;
        topBioregionId = bioregionId;
      } else if (flow > secondFlow) {
        secondFlow = flow;
        secondBioregionId = bioregionId;
      }
    });
    this.topBioregionId = topBioregionId;
    this.topBioregionProportion = topFlow / this.flow;
    this.secondBioregionId = secondBioregionId;
    this.secondBioregionProportion = secondFlow / this.flow;

    if (this.bioregionIds.size === 1) {
      this.secondBioregionId = this.topBioregionId;
      this.secondBioregionProportion = this.topBioregionProportion;
    }
  }

  get size() {
    return this.bioregionIds.size;
  }

  clear() {
    this.bioregionIds = new Map();
    this.flow = 0.0;
    this.topBioregionId = 0;
    this.memoryIdToBioregion = new Map();
  }
}
