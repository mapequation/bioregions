class FlowCount {
  flow: number = 0.0;
  count: number = 0;

  add(flow: number) {
    this.flow += flow;
    this.count += 1;
  }

  static init(flow: number) {
    const fc = new FlowCount()
    fc.add(flow);
    return fc;
  }
}

export default class ConnectedBioregions {
  bioregionId: number = 0;
  bioregionIds: Map<number, FlowCount> = new Map(); // bioregionId -> flow
  flowCount: FlowCount = new FlowCount(); // total flow and count (num species) in cell
  memoryIdToBioregion: Map<string, number> = new Map();
  topBioregionId: number = 0;
  topBioregionProportion: number = 0;
  secondBioregionId: number = 0;
  secondBioregionProportion: number = 0;
  // color: string;
  notTopBioregion: boolean = false;
  ownProportion: number = 1;

  setOwnBioregion(bioregionId: number) {
    this.bioregionId = bioregionId;
  }

  addLink(bioregionId: number, flow: number) {
    this.flowCount.add(flow);
    const flowCount = this.bioregionIds.get(bioregionId);
    if (!flowCount) {
      this.bioregionIds.set(bioregionId, FlowCount.init(flow));
    } else {
      flowCount.add(flow);
    }
  }

  calcTopBioregions() {
    // Calculate top
    let topFlow = 0;
    let topBioregionId = 0;
    let secondFlow = 0;
    let secondBioregionId = 0;
    this.bioregionIds.forEach((flowCount, bioregionId) => {
      const { flow } = flowCount;
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

    if (this.bioregionId !== topBioregionId) {
      this.notTopBioregion = true;
      // this.topBioregionId = this.bioregionId;
      // this.topBioregionProportion = (this.bioregionIds.get(this.bioregionId) ?? 0) / this.flow;
      // this.secondBioregionId = topBioregionId;
      // this.secondBioregionProportion = topFlow / this.flow;
    }
    this.ownProportion = (this.bioregionIds.get(this.bioregionId)?.flow ?? 0) / this.flowCount.flow;
    this.topBioregionId = topBioregionId;
    this.topBioregionProportion = topFlow / this.flowCount.flow;
    this.secondBioregionId = secondBioregionId;
    this.secondBioregionProportion = secondFlow / this.flowCount.flow;

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
    this.flowCount = new FlowCount();
    this.topBioregionId = 0;
    this.memoryIdToBioregion = new Map();
  }
}
