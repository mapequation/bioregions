import React, {Component, PropTypes} from 'react';
import FileLoader from './FileLoader'
import Infomap from './Infomap'

class ControlPanel extends Component {
  constructor(props) {
    super(props);
  }

  renderDataDependentComponents() {
    const {data} = this.props;
    // const {runInfomap} = this.props.actions;
    if (data.features.length === 0)
      return "";
    return (
      <Infomap data={data} runInfomap={() => {console.log("Run infomap...");}} />
    )
  }

  render() {
    const {files, actions} = this.props;
    return (
      <div>
        <FileLoader {...files} {...actions} />
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
