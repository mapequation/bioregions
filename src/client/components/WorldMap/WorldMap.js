import React, {Component, PropTypes} from 'react';
import worldMapChart from './worldMapChart.js';
import * as DataFetching from '../../constants/DataFetching';
import {BY_NAME, BY_CLUSTER} from '../../constants/Display';
import d3 from 'd3';
import d3tip from 'd3-tip';
import d3tipStyles from './d3-tip.css';
import R from 'ramda';

class WorldMap extends Component {

  static propTypes = {
    width: PropTypes.number.isRequired,
    height: PropTypes.number.isRequired,
    projection: PropTypes.func.isRequired,
    graticuleStep: PropTypes.number.isRequired,
    world: PropTypes.object.isRequired,
    worldStatus: PropTypes.string.isRequired,
    loadWorld: PropTypes.func.isRequired,
    havePolygons: PropTypes.bool.isRequired,
    features: PropTypes.array.isRequired,
    binning: PropTypes.object.isRequired,
    bins: PropTypes.array.isRequired,
    mapBy: PropTypes.oneOf([BY_NAME, BY_CLUSTER]).isRequired,
    clusterColors: PropTypes.array.isRequired,
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

  state = {
    onMouseOver: ::this.handleMouseOverGridCell,
    onMouseOut: ::this.handleMouseOutGridCell,
    onMouseClick: ::this.handleMouseClickGridCell,
  }

  // Using arrow functions and ES7 Class properties to autobind
  // http://babeljs.io/blog/2015/06/07/react-on-es6-plus/#arrow-functions
  updateDimensions = () => {
    if (!this.svgParent) {
      throw new Error('Cannot find WorldMap container div')
    }
    let { clientWidth, clientHeight } = this.svgParent;
    let nextState = {
      width: clientWidth,
      containerWidth: clientWidth,
      containerHeight: clientHeight
    };
    this.setState(nextState);
  }

  onResize = () => {
    if (this.rqf) return
    this.rqf = window.requestAnimationFrame(() => {
      this.rqf = null
      this.updateDimensions()
    })
  }


  componentDidMount() {
    this.updateDimensions();
    window.addEventListener('resize', this.onResize, false);
    this.loadWorldIfNotFetched();
    let props = Object.assign({}, this.props, this.state);
    worldMapChart.create(this.svgParent, props);

    this.initTooltip();
  }

  componentDidUpdate() {
    let props = Object.assign({}, this.props, this.state);
    worldMapChart.update(this.svgParent, props);
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this.onResize);
    worldMapChart.destroy(this.svgParent);
  }

  loadWorldIfNotFetched() {
    const worldStatus = this.props.worldStatus;
    if (worldStatus === DataFetching.DATA_NOT_FETCHED) {
      this.props.loadWorld();
    }
  }

  initTooltip() {
    console.log("Init worldmap tooltip");
    this.tip = d3tip().attr("class", "d3-tip")
      .direction("s")
      .html((d) => {
        let topSpecies = R.zip(d.topCommonSpecies, d.topIndicatorSpecies).slice(0,5);

        let clusterInfo = d.clusterId < 0? "" : `Bioregion: ${d.clusterId + 1}`;

        let tableRows = topSpecies.map(([common, indicator]) => `
          <tr>
            <td class="name">${common.name}</td>
            <td class="value">${common.count}</td>
            <td class="name">${indicator.name}</td>
            <td class="value">${indicator.score.toPrecision(3)}</td>
          </tr>`
        ).join("");

        return `
          <div>
            <h4 class="ui inverted header">
              <span class="value total-records-count">${d.count}</span> records of
              <span class="value total-species-count">${d.speciesCount}</span> unique species.
              <div class="sub header">Cell size: ${d.size}˚. ${clusterInfo}</div>
            </h4>
            </p>
            <table class="ui styled inverted table">
              <thead>
                <tr>
                  <th>Most common species</th>
                  <th>Count</th>
                  <th>Most indicative species</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows}
              </tbody>
            </table>
          </div>`;
              //   <p class="top-n text-muted">Top 3:</p>
              //   ${topSpecies.map(d => `<p><span class="value top-count">${d.count}</span> <span class="name">${d.name}</span></p>`).join("")}
              //   <p class="indicative text-muted">Top indicative species:</p>
              //   ${topIndicatorSpecies.map(d => `<p><span class="value top-count">${d.score}</span> <span class="name">${d.name}</span></p>`).join("")}
              // `;

      });
    d3.select(this.getSvg()).call(this.tip);
    console.log("this.tip:", this.tip);
  }

  handleMouseOverGridCell(d) {
    this.tip.show(d);
  }

  handleMouseOutGridCell(d) {
    this.tip.hide(d);
  }

  handleMouseClickGridCell(d) {
    console.log("Mouse click:", d);
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
      <div
        className={`ui ${statusClassName} segment`}
        style={{padding: 0}}
        ref={(el) => this.svgParent = el}>
      </div>
    );
  }
}

export default WorldMap;
