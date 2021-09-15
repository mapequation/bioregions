import React from 'react';
// import d3 from "d3";

export default class TreeWeight extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      weight: 0.5,
      width: 300,
      height: 200,
    };
  }

  // componentDidMount() {
  //   const { width, height } = this.state;

  //   const svg = d3.select(".tree-weight").select("svg");

  //   const x = d3.scale.linear().range([0, 10]);
  //   const y = d3.scale.linear().range([10, 0]);

  //   const xAxis = d3.svg.axis().orient("bottom").scale(x).ticks(10);
  //   const yAxis = d3.svg.axis().orient("left").scale(y).ticks(5);

  //   svg.select(".xAxis").call(xAxis);
  //   svg.select(".yAxis").call(yAxis);
  // }

  render() {
    const { weight, width, height } = this.state;

    return (
      <div
        className="tree-weight"
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '300px',
          gap: '10px',
        }}
      >
        <svg
          ref={(ref) => (this.ref = ref)}
          xmlns="http://www.w3.org/2000/svg"
          viewBox={`-30 -20 ${width + 50} ${height + 50}`}
          width="100%"
          height="200px"
        >
          <g className="xAxis" transform={`translate(0, ${height + 1})`}></g>
          <g className="yAxis"></g>
        </svg>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            style={{ flex: 'auto' }}
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={weight}
            onChange={(e) => this.setState({ weight: e.target.value })}
            className="slider"
            id="myRange"
          ></input>
          <span className="tangle ui orange label">
            {Number(weight).toFixed(1)}
          </span>
        </div>
      </div>
    );
  }
}
