import React, {Component, PropTypes} from 'react';
import FileInput from './FileInput'


class FileLoader extends Component {
  constructor(props) {
    super(props);
  }


  renderFileOptions() {
    const {parseHeader, data, cancelFileActions, ...other} = this.props;
    if (!parseHeader)
      return (<span></span>);

    var ErrorMessage = ({message, subMessage, children}) => (
      <Dimmer onCancel={cancelFileActions} subHeader={this.props.loadedFiles[0]}>
        {children}
        <div className="ui negative message">
          <div className="header">
            {message}
          </div>
          {subMessage}
        </div>
      </Dimmer>
    );
    ErrorMessage.defaultProps = {
      subMessage: ""
    };

    let newlineIndex = data.indexOf('\n');
    if (newlineIndex == -1) {
      return (
        <ErrorMessage message="Couldn't read a line from the file"
          subMessage="Please check the file content and try again.">
        </ErrorMessage>
      )
    }
    let headLines = [];
    let prevIndex = 0;
    while (newlineIndex !== -1 && headLines.length < 5) {
      headLines.push(data.substring(prevIndex, newlineIndex));
      prevIndex = newlineIndex + 1;
      newlineIndex = data.indexOf('\n', prevIndex);
    }
    let headerLine = headLines[0];

    let isTSV = headerLine.split('\t').length > 1;
    let isCSV = headerLine.split(',').length > 1;

    if (!isTSV && !isCSV) {
      return (
        <ErrorMessage message="Couldn't recognise the format as CSV or TSV.">
          <div className="ui form">
            <div className="field">
              <label>File head</label>
              <textarea readonly rows={headLines.length} value={headLines.join('\n')}></textarea>
            </div>
          </div>
        </ErrorMessage>
      )
    }

    let parser = isTSV? d3.tsv : d3.csv;

    let parsedHead = parser.parseRows(headLines.join('\n'));

    let columns = parsedHead.shift();

    var HeadTable = ({head, rows}) => (
      <table className="ui celled striped table">
        <thead>
          <tr>
            {head.map(column => (<th key={column}>{column}</th>))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row,i) => (
            <tr key={i}>
              {row.map((value,j) => (<td key={`${i},${j}`}>{value}</td>))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th colSpan={head.length}>
              ...
            </th>
          </tr>
        </tfoot>
      </table>
    );

    if (columns.length < 3) {
      return (
        <ErrorMessage message="Couldn't parse enough columns">
          <HeadTable head={columns} rows={parsedHead}></HeadTable>
        </ErrorMessage>
      )
    }

    function getMatchingColumns(columns) {
      // Transform the columns to filter out lat/long
      let truncatedColumns = columns
        .map(col => col.toLowerCase())
        .map(col => col.replace(/decimal/, ""))
        .map(col => col.replace(/itude/, "")) // long(itude)/lat(itude)
      let lat = _.findIndex(truncatedColumns, col => col == "lat");
      let long = _.findIndex(truncatedColumns, col => col == "long");
      if (lat > 0 && long > 0)
        return [0, lat, long];
      console.log("Couldn't guess lat/long columns, use last two.");
      return [0, columns.length - 2, columns.length - 1];
    }

    let [nameIndex, latIndex, longIndex] = getMatchingColumns(columns);

    let selectOptions = columns.map((col, i) => (<option key={i} value={col}>{col}</option>));

    return (
      <Dimmer onCancel={cancelFileActions} subHeader={this.props.loadedFiles[0]}>
        <HeadTable head={columns} rows={parsedHead}></HeadTable>

        <h2 className="ui header">Select how to parse columns</h2>
        <div className="ui center aligned container grid">
          <div className="ui compact segment">
            <table className="ui very basic collapsing celled table">
              <tbody>
                <tr>
                  <td>Name</td>
                  <td>
                    <select className="ui dropdown" value={columns[nameIndex]}>
                      {selectOptions}
                    </select>
                  </td>
                </tr>
                <tr>
                  <td>Latitude</td>
                  <td>
                    <select className="ui dropdown" value={columns[latIndex]}>
                      {selectOptions}
                    </select>
                  </td>
                </tr>
                <tr>
                  <td>Longitude</td>
                  <td>
                    <select className="ui dropdown" value={columns[longIndex]}>
                      {selectOptions}
                    </select>
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan="2" className="right aligned">
                    <button type="submit" className="ui basic button">Submit</button>
                  </th>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </Dimmer>
    );
  }

  render() {
    const {loadedFiles, parseHeader, data, ...other} = this.props;
    console.log("loadedFiles:", loadedFiles);
    return (
      <div>
        <FileInput {...other} />
        {this.renderFileOptions()}
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
  parseHeader: PropTypes.bool.isRequired,
  data: PropTypes.string.isRequired,
  setError: PropTypes.func.isRequired,
};


var Dimmer = ({header, subHeader, onCancel, children}) => (
  <div className="ui inverted active page dimmer" style={{overflow: 'auto'}}>
    <div className="ui container">
      <h1 className="ui header">
        {header}
        <div className="sub header">{subHeader}</div>
      </h1>
      {children}
      <div className="ui divider"></div>
      <button className="ui very basic button" tabIndex="0" onClick={onCancel}>Cancel</button>
    </div>
  </div>
);

Dimmer.propTypes = {
  header: PropTypes.string.isRequired,
  subHeader: PropTypes.string.isRequired,
  onCancel: PropTypes.func.isRequired,
}

Dimmer.defaultProps = {
  header: "Parse file",
  subHeader: "",
}

export default FileLoader;
