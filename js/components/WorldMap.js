import React, {Component, PropTypes} from 'react';
import worldChart from '../charts/worldMap.js';
import * as DataFetching from '../constants/DataFetching';

class WorldMap extends Component {
  constructor(props) {
    super(props);
  }

  componentDidMount() {
    console.log("WorldMap::componentDidMount()");
    this.loadWorldIfNotFetched();
    worldChart.create(this.svgParent, this.props);
  }

  componentDidUpdate() {
    console.log("WorldMap::componentDidUpdate()");
    this.loadWorldIfNotFetched();
    worldChart.update(this.svgParent, this.props);
  }

  componentWillUnmount() {
    worldChart.destroy(this.svgParent);
  }

  loadWorldIfNotFetched() {
    const worldStatus = this.props.worldStatus;
    if (worldStatus === DataFetching.DATA_NOT_FETCHED) {
      console.log("WorldMap -> loadWorld()");
      this.props.loadWorld();
    }
  }

  render() {
    console.log("WorldMap::render()");
    let statusClassName = "";
    switch (this.props.worldStatus) {
      case DataFetching.DATA_NOT_FETCHED:
        statusClassName = "disabled"
        break;
      case DataFetching.DATA_FETCHING:
        statusClassName = "loading";
        break;
      case DataFetching.DATA_FAILED:
        statusClassName = "red";
        break;
    }
    return (
      <div className={`ui ${statusClassName} segment`} ref={(el) => this.svgParent = el}></div>
    );
  }
}

WorldMap.propTypes = {
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  projection: PropTypes.func.isRequired,
  world: PropTypes.object.isRequired,
  worldStatus: PropTypes.string.isRequired,
  loadWorld: PropTypes.func.isRequired,
  havePolygons: PropTypes.bool.isRequired,
  features: PropTypes.array.isRequired,
  binner: PropTypes.object.isRequired,
  bins: PropTypes.array.isRequired,
};

export default WorldMap;
