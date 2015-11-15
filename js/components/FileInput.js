import React, {Component, PropTypes} from 'react';

class FileInput extends Component {

  static propTypes = {
    isLoading: PropTypes.bool.isRequired,
    sampleFiles: PropTypes.array.isRequired,
    loadFiles: PropTypes.func.isRequired,
    loadSampleFile: PropTypes.func.isRequired,
  }

  componentDidMount() {
    $('.ui.dropdown').dropdown();
    $('#inputfile').on('change', (e) => {
      this.props.loadFiles(e.target.files);
    });
  }

  componentDidUpdate() {
    $('.ui.dropdown').dropdown('refresh');
  }

  componentWillUnmount() {
    $('#inputfile').off('change');
  }

  handleClickLoadFile() {
    $(this.refs.inputfile).click();
  }

  render() {
    return (
      <div className="ui buttons">
        <div className="ui button" onClick={::this.handleClickLoadFile}>Load data...</div>
        <input id="inputfile" ref="inputfile" style={{display: "none"}} type="file" multiple placeholder="File input"></input>
        <div className="ui floating dropdown icon button">
          <i className="dropdown icon"></i>
          <div className="menu">
            {this.props.sampleFiles.map((sampleFile) => (
              <div key={sampleFile.filename} className="item" onClick={() => this.props.loadSampleFile(sampleFile.filename)}>{sampleFile.name}</div>
            ))}
          </div>
        </div>
      </div>
    );
  }
}

export default FileInput;
