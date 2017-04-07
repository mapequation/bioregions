import React, {Component, PropTypes} from 'react';
import {connect} from 'react-redux';
import {bindActionCreators} from 'redux';
import cn from 'classnames';
import ControlPanel from '../components/ControlPanel/ControlPanel';
import WorldMap from '../components/WorldMap/WorldMap';
import WorldMapDimmer from '../components/WorldMap/WorldMapDimmer';
import Phylogram from '../components/Phylogram/Phylogram';
import Tree from '../components/Phylogram/Tree';
import Statistics from '../components/Statistics';
import SpeciesInfo from '../components/SpeciesInfo';
import * as FileLoaderActions from '../actions/FileLoaderActions';
import * as WorldmapActions from '../actions/WorldmapActions';
import * as ClusterActions from '../actions/ClusterActions';
import * as BinningActions from '../actions/BinningActions';
import * as DisplayActions from '../actions/DisplayActions';
import * as FilterActions from '../actions/FilterActions';
import * as ErrorActions from '../actions/ErrorActions';
import * as PhylogramActions from '../actions/PhylogramActions';
import {CALCULATE_CLUSTERS, DATA_WORKER_INITIATED} from '../constants/ActionTypes';
import {calculateInfomapClusters} from '../utils/clustering';
import AppStyles from './App.scss';

class App extends Component {
  constructor(props) {
    super(props);
    this.dataWorkerInitiatedGuard = false;
  }

  componentDidMount() {
    console.log("App::componentDidMount()");
    this.checkDataWorkerInitiated(this.props.data);
  }

  componentWillReceiveProps(nextProps) {
    this.checkDataWorkerInitiated(nextProps.data);
  }

  checkDataWorkerInitiated(data) {
    if (!data.dataWorkerInitiated && !this.dataWorkerInitiatedGuard) {
      this.initDataWorker(data.dataWorker);
    }
    else if (data.dataWorkerInitiated && this.dataWorkerInitiatedGuard)
      this.dataWorkerInitiatedGuard = false;
  }

  initDataWorker(dataWorker) {
    const {data, dispatch} = this.props;
    let {progressEmitter} = data;

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
    }, false);

    console.log("\n[App] Initiated data worker!");
    dispatch({
      type: DATA_WORKER_INITIATED
    });
  }


  render() {
    const {data, files, worldmap, phylogram, errorMessage, actions} = this.props;

    return (
      <div className="app">
        <div className="ui container">
          <div className={cn("ui negative message transition", { hidden: !errorMessage })}>
            <i className="close icon" onClick={actions.resetError}></i>
            <div className="header">
              Internal error:
            </div>
            <p>{errorMessage}</p>
            <p>Please contact us with the message above.</p>
          </div>
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
          <Tree {...data} {...phylogram} {...actions} />
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
  phylogram: PropTypes.object.isRequired,
  errorMessage: PropTypes.string,
  actions: PropTypes.object.isRequired,
};

function mapStateToProps(state) {
  return state;
}

function mapDispatchToProps(dispatch) {
  return {
    actions: bindActionCreators(Object.assign({},
      FileLoaderActions,
      WorldmapActions,
      PhylogramActions,
      ClusterActions,
      BinningActions,
      DisplayActions,
      FilterActions,
      ErrorActions,
    ), dispatch),
    dispatch,
  };
}

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(App);
