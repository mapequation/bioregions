import React, {Component, PropTypes} from 'react';
import { observer } from 'mobx-react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';
import * as FileLoaderActions from '../actions/FileLoaderActions';
import * as WorldmapActions from '../actions/WorldmapActions';
import * as InfoActions from '../actions/InfoActions';
import * as ClusterActions from '../actions/ClusterActions';
import * as BinningActions from '../actions/BinningActions';
import * as DisplayActions from '../actions/DisplayActions';
import * as FilterActions from '../actions/FilterActions';
import * as ErrorActions from '../actions/ErrorActions';
import * as PhylogramActions from '../actions/PhylogramActions';
import { Accordion, Label } from 'semantic-ui-react';
import FileLoaderDimmer from '../components/ControlPanel/FileLoaderDimmer';
import Binning from '../components/ControlPanel/Binning';
import Export from '../components/ControlPanel/Export';
import GridControl from '../components/ControlPanel/GridControl';
import MapControl from '../components/ControlPanel/MapControl';
import InfoControl from '../components/ControlPanel/InfoControl';
import ShowInfomapButton from '../components/Infomap/ShowInfomapButton';
import InfomapDimmer from '../components/Infomap/InfomapDimmer';
import InfoTitle from '../components/ControlPanel/InfoTitle';


// const InfoTitle = observer(({ active, highlightStore }) =>
//   !active && highlightStore.highlightedCell ? (
//   <span>Info <Label color="blue" size="mini" circular>i</Label></span>
// ) : 'Info');

class ControlPanel extends Component {
  constructor(props) {
    super(props);
  }

  componentDidMount() {
    // $('.ui.accordion').accordion();
  }

  toggleShowFileUI = () => {
    this.props.actions.showFileUI(!this.props.files.isShowingFileUI);
  }

  handleTitleClick = (e, itemProps) => {
    const { index } = itemProps;
    const { display } = this.props;
    const { panelIndex } = display;
    const newIndex = panelIndex === index ? -1 : index;

    this.props.actions.selectPanel(newIndex);
  }


  render() {
    const {files, data, info, display, worldmap, actions, highlightStore } = this.props;
    const { panelIndex } = display;
    // const InfoTitle = (display.panelIndex !== 1 && highlightStore.highlightedCell) ? (
    //   <span>Info <Label color="blue" size="mini" circular>i</Label></span>
    // ) : 'Info';
    const panels = [
      {
        title: {
          content: 'Data',
          key: 'Data-title',
        },
        content: {
          content: (
            <div>
              <button className="ui button" onClick={this.toggleShowFileUI}>Load data...</button>
              <Binning {...data.binning} binningLoading={data.binningLoading} progressEmitter={data.progressEmitter} {...actions} />
              <ShowInfomapButton {...data} {...display} {...actions} />
              <Export {...data} {...display} {...files} {...worldmap} />
            </div>
          ),
          key: 'Data-content',
        },
      },
      {
        title: {
          content: <InfoTitle active={display.panelIndex === 1} highlightStore={highlightStore} />,
          key: 'Info-title',
        },
        content: {
          content: (
            <div>
              <InfoControl
                highlightStore={this.props.highlightStore}
                {...data}
                {...display}
                {...info}
                {...worldmap}
                {...actions}
              />
            </div>
          ),
          key: 'Info-content',
        },
      },
      {
        title: {
          content: 'Map',
          key: 'Map-title',
        },
        content: {
          content: (
            <div>
              <MapControl {...data} {...display} {...worldmap} {...actions}/>
              <GridControl {...worldmap} {...display} {...actions}/>
            </div>
          ),
          key: 'Map-content',
        },
      },
    ];
    return (
      <div>
        <Accordion fluid styled panels={panels}
          activeIndex={panelIndex} onTitleClick={this.handleTitleClick} />
        {/*Render dimmers outside so always visible when triggered*/}
        <FileLoaderDimmer {...data} {...display} {...files} {...actions} />
        <InfomapDimmer {...data} {...display} {...actions} />
      </div>
    );
  }
}

ControlPanel.propTypes = {
  files: PropTypes.object.isRequired,
  data: PropTypes.object.isRequired,
  display: PropTypes.object.isRequired,
  info: PropTypes.object.isRequired,
  worldmap: PropTypes.object.isRequired,
  actions: PropTypes.object.isRequired,
  highlightStore: PropTypes.object.isRequired,
};

function mapStateToProps(state) {
  return state;
}

function mapDispatchToProps(dispatch) {
  return {
    actions: bindActionCreators(Object.assign({},
      FileLoaderActions,
      WorldmapActions,
      InfoActions,
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
)(ControlPanel);
