import React, {PropTypes} from 'react';

/**
* A button that triggers a hidden input element of type file.
* props.loadFiles called with an array of File objects if props.multiple,
* else with a single File object.
*/
export default class FileInput extends React.Component {

  static propTypes = {
    loadFiles: PropTypes.func.isRequired,
    children: PropTypes.node.isRequired,
    multiple: PropTypes.bool,
  }

  static defaultProps = {
    children: "Load files...",
    multiple: false,
  }

  handleClickLoadFile = (e) => {
    $(this.inputFile).click();
  }

  handleInputChange = (e) => {
    if (this.props.multiple)
      this.props.loadFiles(Array.from(e.target.files)); // Array from FileList
    else
      this.props.loadFiles(e.target.files[0]);
  }

  render() {
    const {multiple} = this.props;
    return (
      <div>
        <div className="ui button" onClick={this.handleClickLoadFile}>
          {this.props.children}
        </div>
        <input id="inputFile" ref={(el) => this.inputFile = el} style={{display: "none"}} type="file"
          multiple={multiple} placeholder="File input" onChange={this.handleInputChange}></input>
      </div>
    );
  }
}
