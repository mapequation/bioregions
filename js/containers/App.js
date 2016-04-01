import React, {Component, PropTypes} from 'react';
import {connect} from 'react-redux';
import {bindActionCreators} from 'redux';
import ControlPanel from '../components/ControlPanel';
import WorldMap from '../components/WorldMap';
import WorldMapDimmer from '../components/WorldMapDimmer';
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
import AppStyles from './App.scss';

class App extends Component {
  constructor(props) {
    super(props);
  }

  componentDidMount() {
    console.log("App::componentDidMount()");
    this.initDataWorker();
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
        if (error) {
          console.log("Infomap got error:", error);
        }
        else {
          dispatch(ClusterActions.addClusters(clusterIds));
        }
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


  render() {
    const {data, files, worldmap, errorMessage, actions} = this.props;
    return (
      <div className="app">
        <div className="ui container">
          <div className="ui two column stackable grid">
            <div className="four wide column">
              <ControlPanel {...{files, data, worldmap, actions}} />
            </div>
            <div className="twelve wide column">
              {
                data.species.length === 0? (
                  <WorldMapDimmer {...files} {...actions} />
                ) : (
                  <WorldMap {...worldmap} {...data} {...actions} />
                )
              }
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
