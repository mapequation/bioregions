import React, {Component, PropTypes} from 'react';
import {connect} from 'react-redux';
import {bindActionCreators} from 'redux';
import ControlPanel from '../components/ControlPanel';
import WorldMap from '../components/WorldMap';
import Statistics from '../components/Statistics';
import * as fileLoaderActions from '../actions/FileLoaderActions';
import * as worldmapActions from '../actions/WorldmapActions';
import * as ClusterActions from '../actions/ClusterActions';
import * as BinningActions from '../actions/BinningActions';
import d3 from 'd3';
import d3tip from 'd3-tip';
import R from 'ramda';
import crossfilter from 'crossfilter';
import d3tipStyles from '../components/d3-tip.css';
import AppStyles from './App.scss';

class App extends Component {
  constructor(props) {
    super(props);
  }

  componentDidMount() {
    console.log("App::componentDidMount()");
    this.initTooltip();
  }

  initTooltip() {
    var heapselectByValue = crossfilter.heapselect.by(d => d[1]);
    var countByName = R.countBy(feature => feature.properties.name);

    this.tip = d3tip().attr("class", "d3-tip")
      .direction("s")
      .html(function(d) {
        var speciesCounts = R.toPairs(countByName(d.points));
        var topSpecies = heapselectByValue(speciesCounts, 0, speciesCounts.length, 3)
            .sort((a, b) => b[1] - a[1]);
        return `<p class="tooltip-heading">
                    <span class="value total-records-count">${d.points.length}</span> records of
                    <span class="value total-species-count">${speciesCounts.length}</span> unique species
                </p>
                <p class="top-n text-muted">Top 3:</p>` +
            topSpecies.map(d => `<p><span class="value top-count">${d[1]}</span> <span class="name">${d[0]}</span></p>`)
            .join("");
      });
    d3.select(this.worldMap.getSvg()).call(this.tip);
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
    const {data, files, worldmap, errorMessage, actions} = this.props;
    return (
      <div>
        <div className="ui secondary pointing menu">
          <a className="active item">Infomap Bioregions</a>
          <div className="right menu">
            <a className="item">About</a>
          </div>
        </div>
        <div className="ui container">
          <div className="ui two column stackable grid">
            <div className="six wide column">
              <ControlPanel {...{files, data, actions}} />
            </div>
            <div className="ten wide column">
              <WorldMap {...worldmap} {...data} {...actions}
                ref={(instance) => this.worldMap = instance}
                onMouseOver={::this.handleMouseOverGridCell}
                onMouseOut={::this.handleMouseOutGridCell}
                onMouseClick={::this.handleMouseClickGridCell}
               />
             <Statistics {...data} {...actions} />
            </div>
          </div>
        </div>
      </div>
    );
  }
}

App.propTypes = {
  files: PropTypes.object.isRequired,
  data: PropTypes.object.isRequired,
  worldmap: PropTypes.object.isRequired,
  errorMessage: PropTypes.string,
  actions: PropTypes.object.isRequired,
};

function mapStateToProps(state) {
  return state;
}

function mapDispatchToProps(dispatch) {
  return {
    actions: bindActionCreators(Object.assign({},
      fileLoaderActions,
      worldmapActions,
      ClusterActions,
      BinningActions,
    ), dispatch)
  };
}

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(App);
