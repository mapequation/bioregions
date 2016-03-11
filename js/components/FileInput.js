import React, {Component, PropTypes} from 'react';

/**
* A button that triggers a hidden input element of type file.
* props.loadFiles called with an array of File objects if props.multiple,
* else with a single File object.
*/
class FileInput extends Component {

  static propTypes = {
    loadFiles: PropTypes.func.isRequired,
    children: PropTypes.node.isRequired,
    multiple: PropTypes.bool,
  }

  static defaultProps = {
    children: "Load files...",
    multiple: false,
  }

  componentDidMount() {
    $('#inputFile').on('change', (e) => {
      if (this.props.multiple)
        this.props.loadFiles(Array.from(e.target.files)); // Array from FileList
      else
        this.props.loadFiles(e.target.files[0]);
    });
  }

  componentWillUnmount() {
    $('#inputFile').off('change');
  }

  handleClickLoadFile = (e) => {
    $(this.inputFile).click();
  }

  render() {
    const {multiple} = this.props;
    return (
      <div>
        <div className="ui button" onClick={this.handleClickLoadFile}>
          {this.props.children}
        </div>
        <input id="inputFile" ref={(el) => this.inputFile = el} style={{display: "none"}} type="file" multiple={multiple} placeholder="File input"></input>
      </div>
    );
  }

}

export default FileInput;
