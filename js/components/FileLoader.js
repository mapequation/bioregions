import React, {Component, PropTypes} from 'react';
import FileInput from './FileInput'


class FileLoader extends Component {

  state = {
    fieldsToParse: {
      Name: 0,
      Latitude: 1,
      Longitude: 2,
    },
    submitted: false,
    error: false,
    message: "",
    subMessage: "",
    headLines: [],
    parsedHead: [],
  }

  componentWillReceiveProps(nextProps) {
    const {parseHeader, data} = nextProps;
    if (parseHeader)
      this.parsePointOccurrenceDataHeader(data);
  }

  parsePointOccurrenceDataHeader(data) {
    let parsedState = {};
    let newlineIndex = data.indexOf('\n');
    if (newlineIndex == -1)
      return this.setState({
        error: true,
        message: "Couldn't read a line from the file",
        subMessage: "Please check the file content and try again."
      });

    let headLines = [];
    let prevIndex = 0;
    while (newlineIndex !== -1 && headLines.length < 5) {
      headLines.push(data.substring(prevIndex, newlineIndex));
      prevIndex = newlineIndex + 1;
      newlineIndex = data.indexOf('\n', prevIndex);
    }
    // Add to parsed state
    parsedState.headLines = headLines;

    let headerLine = headLines[0];
    let isTSV = headerLine.split('\t').length > 1;
    let isCSV = headerLine.split(',').length > 1;

    if (!isTSV && !isCSV)
      return this.setState({
        ...parsedState,
        error: true,
        message: "Couldn't recognise the format as CSV or TSV.",
        subMessage: ""
      });

    let parser = isTSV? d3.tsv : d3.csv;

    const parsedHead = parser.parseRows(headLines.join('\n'));
    // Add to parsed state
    parsedState.parsedHead = parsedHead;

    let columns = parsedHead[0];

    if (columns.length < 3)
      return this.setState({
        ...parsedState,
        error: true,
        message: "Couldn't parse enough columns",
        subMessage: ""
      });

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
    this.setState({
      ...parsedState,
      fieldsToParse: {
        Name: nameIndex,
        Latitude: latIndex,
        Longitude: longIndex,
      }
    });
  }

  handleChange = (event) => {
     console.log("!!!! handleChange:", event.target.value);
  }

  renderFileOptions() {
    const {parseHeader, loadedFiles, cancelFileActions} = this.props;
    const {error, message, subMessage, headLines, parsedHead, fieldsToParse, submitted} = this.state;
    if (!parseHeader)
      return (<span></span>);

    var ErrorMessage = ({message, subMessage, children}) => (
      <Dimmer onCancel={cancelFileActions} subHeader={loadedFiles[0]}>
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

    if (error) {
      if (headLines.length === 0)
        return (
          <ErrorMessage message={message} subMessage={subMessage}>
          </ErrorMessage>
        );

      if (parsedHead.length === 0)
        return (
          <ErrorMessage message={message} subMessage={subMessage}>
            <div className="ui form">
              <div className="field">
                <label>File head</label>
                <textarea readonly rows={headLines.length} value={headLines.join('\n')}></textarea>
              </div>
            </div>
          </ErrorMessage>
        );

      return (
        <ErrorMessage message={message} subMessage={subMessage}>
          <HeadTable head={parsedHead[0]} rows={parsedHead.slice(1)}></HeadTable>
        </ErrorMessage>
      )
    }

    if (!submitted) {

      const columns = parsedHead[0];
      const selectOptions = columns.map((col, i) => (<option key={i} value={i}>{col}</option>));
      const {Name, Latitude, Longitude} = fieldsToParse;

      return (
        <Dimmer onCancel={cancelFileActions} subHeader={loadedFiles[0]}>
          <HeadTable head={columns} rows={parsedHead.slice(1)}></HeadTable>

          <h2 className="ui header">Select how to parse columns</h2>
          <div className="ui center aligned container grid">
            <div className="ui compact segment">
              <table className="ui very basic collapsing celled table">
                <tbody>
                  <tr>
                    <td>Name</td>
                    <td>
                      <select className="ui dropdown" onChange={(e) => {
                          console.log("!!!!CHANGE STATE:", e.target.value);
                          this.setState({
                            fieldsToParse: {
                              ...fieldsToParse,
                              Name: e.target.value
                            }
                          });
                        }} value={Name}>
                        {selectOptions}
                      </select>
                    </td>
                  </tr>
                  <tr>
                    <td>Latitude</td>
                    <td>
                      <select className="ui dropdown" onChange={this.asdf}
                        value={Latitude}>
                        {selectOptions}
                      </select>
                    </td>
                  </tr>
                  <tr>
                    <td>Longitude</td>
                    <td>
                      <select className="ui dropdown" onChange={(e) => {console.log("Change Longitude to", e.target.value);}}
                        defaultValue={Longitude}>
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

    // Parsing file...

    return (
      <Dimmer onCancel={cancelFileActions} subHeader={loadedFiles[0]}>
        <HeadTable head={columns} rows={parsedHead.slice(1)}></HeadTable>
        <h2 className="ui header">
          Parsing file...
        </h2>
      </Dimmer>
    )
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

export default FileLoader;
