import React, {Component, PropTypes} from 'react';
import FileLoader from './FileLoader';
import Infomap from './Infomap';
import Binning from './Binning';

class ControlPanel extends Component {
  constructor(props) {
    super(props);
  }

  runInfomap() {
    this.props.actions.getClusters();
  }

  renderDataDependentComponents() {
    const {data, actions} = this.props;
    // const {runInfomap} = this.props.actions;
    if (data.features.length === 0)
      return "";
    return (
      <div className="ui vertical segment">
        <Infomap {...data} runInfomap={::this.runInfomap} />
      </div>
    )
  }

  render() {
    const {files, data, actions} = this.props;
    return (
      <div className="ui segment">
        <div className="ui vertical segment">
          <FileLoader {...files} {...actions} />
        </div>
        <Binning {...data.binning} {...actions} />
        {this.renderDataDependentComponents()}
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
