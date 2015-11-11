import React, {Component, PropTypes} from 'react';
import FileLoader from './FileLoader';
import Infomap from './Infomap';
import Binning from './Binning';

class ControlPanel extends Component {
  constructor(props) {
    super(props);
  }

  componentDidMount() {
    $('.ui.accordion').accordion();
  }

  render() {
    const {files, data, actions} = this.props;
    return (
      <div className="ui styled accordion">
        <div className="active title">
          <i className="dropdown icon"></i>
          Data
        </div>
        <div className="active content">
          <FileLoader {...files} {...actions} />
          <Binning {...data.binning} {...actions} />
          <Infomap {...data} {...actions} />
        </div>
        <div className="title">
          <i className="dropdown icon"></i>
          Map
        </div>
        <div className="content">
          <p>Color settings etc...</p>
          <button className="ui basic button">Export...</button>
        </div>
      </div>
    );
  }
}

ControlPanel.propTypes = {
  files: PropTypes.object.isRequired,
  data: PropTypes.object.isRequired,
  actions: PropTypes.object.isRequired,
};

export default ControlPanel;
