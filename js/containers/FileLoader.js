import React, {Component, PropTypes} from 'react';
import {connect} from 'react-redux';
import {bindActionCreators} from 'redux';
import FileInput from '../components/FileInput'

class FileLoader extends Component {
  constructor(props) {
    super(props);
  }

  render() {
    const {loadedFiles, ...other} = this.props;
    return (
      <div>
        <FileInput {...other} />
        {this.props.loadedFiles.map((file) => (<p>{file}</p>))}
      </div>
    );
  }
}

FileLoader.propTypes = {
  isLoading: PropTypes.bool.isRequired,
  loadedFiles: PropTypes.array.isRequired,
  sampleFiles: PropTypes.array.isRequired,
  loadFiles: PropTypes.func.isRequired,
  loadSampleFile: PropTypes.func.isRequired,
};

export default FileLoader;
