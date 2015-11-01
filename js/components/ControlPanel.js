import React, {Component, PropTypes} from 'react';
import FileLoader from './FileLoader'
import Infomap from './Infomap'

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
      <Infomap data={data} runInfomap={::this.runInfomap} />
    )
  }

  render() {
    const {files, actions} = this.props;
    return (
      <div className="ui segment">
        <div className="ui vertical segment">
          <FileLoader {...files} {...actions} />
        </div>
        <div className="ui vertical segment">
          {this.renderDataDependentComponents()}
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
