import React, {Component, PropTypes} from 'react';
import FileLoader from './FileLoader';
import Binning from './Binning';
import Export from './Export';
import {BY_NAME, BY_CLUSTER} from '../../constants/Display';
import GridControl from './GridControl';
import MapControl from './MapControl';
import TangleInput from '../lib/TangleInput';
import Tooltip from '../lib/Tooltip';
import ShowInfomapButton from '../Infomap/ShowInfomapButton';
import InfomapDimmer from '../Infomap/InfomapDimmer';
import Div from '../helpers/Div';

class ControlPanel extends Component {
  constructor(props) {
    super(props);
  }

  componentDidMount() {
    $('.ui.accordion').accordion();
  }

  render() {
    const {files, data, worldmap, actions} = this.props;
    return (
      <div>
        <div className="ui styled accordion">
          <div className="active title">
            <i className="dropdown icon"></i>
            Data
          </div>
          <Div className="active content" paddingTop="0">
            <FileLoader {...data} {...files} {...actions} />
            <Binning {...data.binning} binningLoading={data.binningLoading} progressEmitter={data.progressEmitter} {...actions} />
            <ShowInfomapButton {...data} {...actions} />
            <Export {...data} {...files} {...worldmap}></Export>
          </Div>
          <div className="title">
            <i className="dropdown icon"></i>
            Map
          </div>
          <Div className="content" paddingTop="0">
            <MapControl {...data} {...worldmap} {...actions}/>
            <GridControl {...worldmap} {...actions}/>
          </Div>
        </div>
        <InfomapDimmer {...data} {...actions} />
      </div>
    );
  }
}

ControlPanel.propTypes = {
  files: PropTypes.object.isRequired,
  data: PropTypes.object.isRequired,
  worldmap: PropTypes.object.isRequired,
  actions: PropTypes.object.isRequired,
};

export default ControlPanel;
