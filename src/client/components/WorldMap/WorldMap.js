import React, { Component } from 'react';
import worldMapChart from './worldMapChart.js';
import * as DataFetching from '../../constants/DataFetching';
import {BY_CELL, BY_CLUSTER} from '../../constants/Display';
import * as Binning from '../../constants/Binning';
import d3 from 'd3';
import d3tip from 'd3-tip';
import d3tipStyles from './d3-tip.css';
import PropTypes from 'prop-types';
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
    mapBy: PropTypes.oneOf([BY_CELL, BY_CLUSTER]).isRequired,
    infoBy: PropTypes.oneOf([BY_CELL, BY_CLUSTER]).isRequired,
    clusterColors: PropTypes.array.isRequired,
    selectedClusterId: PropTypes.number.isRequired,
    selectedCell: PropTypes.object,
    highlightedCell: PropTypes.object,
    highlightCell: PropTypes.func.isRequired,
    selectCluster: PropTypes.func.isRequired,
    selectCell: PropTypes.func.isRequired,
    highlightStore: PropTypes.object.isRequired,
  }

  constructor(props) {
    super(props);
    this.formatArea = d3.format(',.2g');

    this.state = {
      onMouseOver: this.handleMouseOverGridCell,
      onMouseOut: this.handleMouseOutGridCell,
      onMouseClick: this.handleMouseClickGridCell,
    };
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

  // Using arrow functions and ES7 Class properties to autobind
  // http://babeljs.io/blog/2015/06/07/react-on-es6-plus/#arrow-functions
  updateDimensions = () => {
    if (!this.svgParent) {
      throw new Error('Cannot find WorldMap container div')
    }
    const { clientWidth, clientHeight } = this.svgParent;
    const nextState = {
      width: clientWidth,
      containerWidth: clientWidth,
      containerHeight: clientHeight,
    };
    this.setState(nextState);
  }

  onResize = () => {
    if (this.rqf) {
      return;
    }
    this.rqf = window.requestAnimationFrame(() => {
      this.rqf = null;
      this.updateDimensions();
    });
  }


  componentDidMount() {
    this.updateDimensions();
    window.addEventListener('resize', this.onResize, false);
    this.loadWorldIfNotFetched();
    const props = Object.assign({}, this.props, this.state);
    worldMapChart.create(this.svgParent, props);

    // this.initTooltip();
  }

  componentDidUpdate() {
    const props = Object.assign({}, this.props, this.state);
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

        const { unit } = this.props.binning;
        const size = unit === Binning.MINUTE ? 60 * d.size : d.size;
        const unitSymbol = unit === Binning.MINUTE ? Binning.MINUTE_SYMBOL : Binning.DEGREE_SYMBOL;
        const sizeText = `${size}x${size}${unitSymbol}`;

        return `
          <div>
            <h4 class="ui inverted header">
              <span class="value total-records-count">${d.count}</span> records of
              <span class="value total-species-count">${d.speciesCount}</span> species.
              <div class="sub header">Cell size: ${sizeText} (${this.formatArea(d.area)} km2). ${clusterInfo}</div>
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
    // console.log("this.tip:", this.tip);
  }

  handleMouseOverGridCell = (d) => {
    // if (this.tip) {
    //   this.tip.show(d);
    // }
    // this.props.highlightCell(d);
    this.props.highlightStore.highlightCell(d);
  }

  handleMouseOutGridCell = (d) => {
    // if (this.tip) {
    //   this.tip.hide(d);
    // }
    // this.props.highlightCell(null);
    this.props.highlightStore.highlightCell(null);
  }

  handleMouseClickGridCell = (d) => {
    // console.log("Mouse click on cell:", d);
    const { infoBy } = this.props;
    if (infoBy === BY_CLUSTER) {
      this.toggleSelectCluster(d);
    } else {
      this.toggleSelectCell(d);
    }
  }

  toggleSelectCell(d) {
    const { selectedCell, selectCell } = this.props;
    if (!d || d === selectedCell) {
      selectCell(null);
    } else {
      selectCell(d);
    }
  }

  toggleSelectCluster(d) {
    const { selectedClusterId, selectCluster } = this.props;
    if (!d || d.clusterId === selectedClusterId) {
      selectCluster(-1);
    } else {
      selectCluster(d.clusterId);
    }
  }

  render() {
    // console.log("WorldMap::render()");
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
