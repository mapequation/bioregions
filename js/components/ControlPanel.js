import React, {Component, PropTypes} from 'react';
import FileLoader from './FileLoader'

class ControlPanel extends Component {
  constructor(props) {
    super(props);
  }

  render() {
    const {files, actions} = this.props;
    return (
      <div>
        <FileLoader {...files} {...actions} />
        Other settings here...
      </div>
    );
  }
}

ControlPanel.propTypes = {
  files: PropTypes.object.isRequired,
  actions: PropTypes.object.isRequired,
};

export default ControlPanel;
