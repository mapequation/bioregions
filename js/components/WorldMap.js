import React, {Component, PropTypes} from 'react';
import worldChart from '../charts/worldMap.js';

class WorldMap extends Component {
  constructor(props) {
    super(props);
  }

  componentDidMount() {
    console.log("WorldMap::componentDidMount()");
    worldChart.create(this.svgParent, this.props);
  }

  componentDidUpdate() {
    console.log("WorldMap::componentDidUpdate()");
    worldChart.update(this.svgParent, this.props);
  }

  componentWillUnmount() {
    worldChart.destroy(this.svgParent);
  }

  render() {
    return (
      <div className="WorldMap" ref={(el) => this.svgParent = el}></div>
    );
  }
}

WorldMap.propTypes = {
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  projection: PropTypes.func.isRequired,
};

export default WorldMap;
