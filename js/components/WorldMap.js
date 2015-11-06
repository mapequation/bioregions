import React, {Component, PropTypes} from 'react';
import worldChart from '../charts/worldMap.js';
import * as DataFetching from '../constants/DataFetching';

class WorldMap extends Component {

  static propTypes = {
    width: PropTypes.number.isRequired,
    height: PropTypes.number.isRequired,
    projection: PropTypes.func.isRequired,
    world: PropTypes.object.isRequired,
    worldStatus: PropTypes.string.isRequired,
    loadWorld: PropTypes.func.isRequired,
    havePolygons: PropTypes.bool.isRequired,
    features: PropTypes.array.isRequired,
    binning: PropTypes.object.isRequired,
    bins: PropTypes.array.isRequired,
    onMouseOver: PropTypes.func.isRequired,
    onMouseOut: PropTypes.func.isRequired,
    onMouseClick: PropTypes.func.isRequired,
  }

  getSvg() {
    return this.svgParent.getElementsByTagName('svg')[0];
  }

  getSvgString() {
    return this.svgParent.innerHTML;
    // .replace(/^<svg/, svgProps)
    // var svgProps = '<svg version="1.1" baseProfile="full" xmlns="http://www.w3.org/2000/svg">';
    // return svgProps + svg.html() + "</svg>";
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

export default WorldMap;
