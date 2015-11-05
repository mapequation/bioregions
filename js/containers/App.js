import React, {Component, PropTypes} from 'react';
import {connect} from 'react-redux';
import {bindActionCreators} from 'redux';
import ControlPanel from '../components/ControlPanel';
import WorldMap from '../components/WorldMap';
import * as fileLoaderActions from '../actions/FileLoaderActions';
import * as worldmapActions from '../actions/WorldmapActions';
import * as ClusterActions from '../actions/ClusterActions';
import d3 from 'd3';
import d3tip from 'd3-tip';
import R from 'ramda';
import crossfilter from 'crossfilter';

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
      .html(function(d) {
        var speciesCounts = R.toPairs(countByName(d.points));
        var topSpecies = heapselectByValue(speciesCounts, 0, speciesCounts.length, 3)
            .sort((a, b) => b[1] - a[1]);
        return `<p class="tooltip-heading">
                    <span class="value total-records-count text-info">${d.points.length}</span> records of
                    <span class="value total-species-count text-info">${speciesCounts.length}</span> unique species
                </p>
                <p class="top-n text-muted">Top 3:</p>` +
            topSpecies.map(d => `<p><span class="value top-count text-info">${d[1]}</span> <span class="name">${d[0]}</span></p>`)
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
      <div className="ui container">
        <header><i className="globe icon"></i> Infomap Bioregions</header>
        <main>
          <div className="ui two column stackable grid">
            <div className="four wide column">
              <ControlPanel {...{files, data, actions}} />
            </div>
            <div className="twelve wide column">
              <WorldMap {...worldmap} {...data} {...actions}
                ref={(instance) => this.worldMap = instance}
                onMouseOver={::this.handleMouseOverGridCell}
                onMouseOut={::this.handleMouseOutGridCell}
                onMouseClick={::this.handleMouseClickGridCell}
               />
            </div>
          </div>
        </main>
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
    ), dispatch)
  };
}

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(App);
