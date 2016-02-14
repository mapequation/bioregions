import React, {Component, PropTypes} from 'react';
import {connect} from 'react-redux';
import {bindActionCreators} from 'redux';
import ControlPanel from '../components/ControlPanel';
import WorldMap from '../components/WorldMap';
import Phylogram from '../components/Phylogram';
import Statistics from '../components/Statistics';
import SpeciesInfo from '../components/SpeciesInfo';
import * as fileLoaderActions from '../actions/FileLoaderActions';
import * as worldmapActions from '../actions/WorldmapActions';
import * as ClusterActions from '../actions/ClusterActions';
import * as BinningActions from '../actions/BinningActions';
import * as DisplayActions from '../actions/DisplayActions';
import * as FilterActions from '../actions/FilterActions';
import * as ErrorActions from '../actions/ErrorActions';
import {CALCULATE_CLUSTERS} from '../constants/ActionTypes';
import {calculateInfomapClusters} from '../utils/clustering';
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
    this.initDataWorker();
    this.initTooltip();
  }

  initDataWorker() {
    const {data, dispatch} = this.props;
    let {progressEmitter, dataWorker} = data;

    dataWorker.addEventListener("message", (event) => {
      const action = event.data;
      // Dispatch all non-progress actions to redux state
      if (!action.isProgress)
        dispatch(action);
      else
        progressEmitter.emit(action.type, action);

      // Workaround as spawning sub workers only supported in Firefox.
      function onInfomapFinished(error, clusterIds) {
        console.log("[App]: Infomap finished in main thread.");
        if (error)
          console.log("Infomap got error:", error);
        else
          dispatch(ClusterActions.addClusters(clusterIds));
      }
      function progressDispatch(progressAction) {
        progressEmitter.emit(progressAction.type, progressAction);
      }
      if (action.type === CALCULATE_CLUSTERS) {
        console.log("[App]: Spawn Infomap worker from main thread...");
        calculateInfomapClusters(progressDispatch, action.infomapArgs, action.payload.networkData, onInfomapFinished);
      }
    });
  }

  initTooltip() {
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
      <div className="">
        <div className="ui secondary pointing menu">
          <a className="active item">Infomap Bioregions</a>
          <div className="item">
            {files.haveFile? (
              <i className="right chevron grey icon">{files.basename}</i>
              ) : (<i></i>)}
          </div>
          <div className="right menu">
            <a className="item">About</a>
          </div>
        </div>
        <div className="ui container">
          <div className="ui two column stackable grid">
            <div className="four wide column">
              <ControlPanel {...{files, data, worldmap, actions}} />
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
          <p></p>
          <Phylogram {...data} />
          <Statistics {...data} {...actions} />
        </div>
        <SpeciesInfo species={data.selectedSpecies} onHide={actions.unselectSpecies} />
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
      DisplayActions,
      FilterActions,
      ErrorActions,
    ), dispatch),
    dispatch
  };
}

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(App);
