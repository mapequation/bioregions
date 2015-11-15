import React, {Component, PropTypes} from 'react';
import FileInput from './FileInput'
import DSVWorker from 'worker!../workers/DSVWorker';

const INITIAL_STATE = {
  fieldsToParse: {
    Name: 0,
    Latitude: 1,
    Longitude: 2,
  },
  fieldsSubmitted: false,
  error: false,
  message: "",
  subMessage: "",
  headLines: [],
  parsedHead: [],
  dsvType: "", // tsv or csv
  numRecordsParsed: 0,
  numRecordsSkipped: 0,
  activity: "",
  done: false,
};

class FileLoader extends Component {

  static propTypes = {
    isLoading: PropTypes.bool.isRequired,
    loadedFiles: PropTypes.array.isRequired,
    sampleFiles: PropTypes.array.isRequired,
    loadFiles: PropTypes.func.isRequired,
    loadSampleFile: PropTypes.func.isRequired,
    parseData: PropTypes.bool.isRequired,
    data: PropTypes.string.isRequired,
    setError: PropTypes.func.isRequired,
    addFeatures: PropTypes.func.isRequired,
  };

  state = INITIAL_STATE;

  componentWillReceiveProps(nextProps) {
    const {parseData, data} = nextProps;
    if (parseData)
      this.parsePointOccurrenceDataHeader(data);
    else if (this.props.parseData) {
      this.setState(INITIAL_STATE);
    }
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
    parsedState.dsvType = isTSV? "tsv" : "csv";
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

  cancelParsing = () => {
    this.setState(INITIAL_STATE);
    this.props.cancelFileActions();
  }

  changeFieldMap = (fieldMap) => {
    let fieldsToParse = Object.assign({}, this.state.fieldsToParse, fieldMap);
     this.setState({
       fieldsToParse
     });
  }

  submitFieldsMap = () => {
    this.setState({
      fieldsSubmitted: true
    });

    var worker = new DSVWorker();
    worker.onmessage = (event) => {
      const {type, message, payload} = event.data;
      if (type === "error") {
        this.setState({
          error: true,
          message
        });
        worker.terminate();
      }
      else if (type === "result") {
        console.log("Got result from worker:", payload);
        worker.terminate();
        this.setState({
          done: true
        });
        this.props.addFeatures(payload.features);
      }
      else if (type === "progress") {
        this.setState({
          numRecordsParsed: payload.count,
          numRecordsSkipped: payload.numSkipped,
          activity: payload.activity
        });
      }
      else {
        console.log("Unrecognised message type from worker:", type);
      }
    }
    worker.onerror = (event) => {
      console.log("Worker error:", event);
      this.setState({
        error: true,
        message: "Worker error",
        subMessage: event.message
      })
      worker.terminate();
    }

    const {data} = this.props;
    const {dsvType, fieldsToParse} = this.state;
    worker.postMessage({
      type: "parse",
      data,
      dsvType,
      fieldsToParse,
    });
  }

  ErrorMessage = ({message, subMessage, children}) => (
    <Dimmer onCancel={this.cancelParsing} subHeader={this.props.loadedFiles[0]}>
      {children}
      <div className="ui negative message">
        <div className="header">
          {message}
        </div>
        {subMessage}
      </div>
    </Dimmer>
  );

  renderFileOptions() {
    const {parseData, loadedFiles} = this.props;
    const {error, message, subMessage, headLines, parsedHead, fieldsToParse, fieldsSubmitted, done} = this.state;
    if (!parseData)
      return (<span></span>);

    if (done) { // Will soon be restored to initial state with !parseData
      return (<span></span>);
    }

    const ErrorMessage = this.ErrorMessage;

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

    const columns = parsedHead[0];

    // Test
    // if (columns.length > 3) {
    //   return (
    //     <Dimmer onCancel={this.cancelParsing} subHeader={loadedFiles[0]}>
    //       <HeadTable head={columns} rows={parsedHead.slice(1)}></HeadTable>
    //       <div className="ui indeterminate inline text loader">
    //         <h2 className="ui header">
    //           Parsing rows...
    //           <div className="sub header">12000 records parsed, 344 invalid records skipped.</div>
    //         </h2>
    //       </div>
    //     </Dimmer>
    //   )
    // }

    if (!fieldsSubmitted) {
      const selectOptions = columns.map((col, i) => (<option key={i} value={i}>{col}</option>));
      const {Name, Latitude, Longitude} = fieldsToParse;

      return (
        <Dimmer onCancel={this.cancelParsing} subHeader={loadedFiles[0]}>
          <HeadTable head={columns} rows={parsedHead.slice(1)}></HeadTable>

          <h2 className="ui header">Select how to parse columns</h2>
          <div className="ui center aligned container grid">
            <div className="ui compact segment">
              <table className="ui very basic collapsing celled table">
                <tbody>
                  <tr>
                    <td>Name</td>
                    <td>
                      <select value={Name} onChange={(e) => {this.changeFieldMap({Name: e.target.value})}}>
                        {selectOptions}
                      </select>
                    </td>
                  </tr>
                  <tr>
                    <td>Latitude</td>
                    <td>
                      <select value={Latitude} onChange={(e) => {this.changeFieldMap({Latitude: e.target.value})}}>
                        {selectOptions}
                      </select>
                    </td>
                  </tr>
                  <tr>
                    <td>Longitude</td>
                    <td>
                      <select value={Longitude} onChange={(e) => {this.changeFieldMap({Longitude: e.target.value})}}>
                        {selectOptions}
                      </select>
                    </td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr>
                    <th colSpan="2" className="right aligned">
                      <button type="submit" className="ui basic button" onClick={this.submitFieldsMap}>Submit</button>
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
    const {numRecordsParsed, numRecordsSkipped, activity} = this.state;
    return (
      <Dimmer onCancel={this.cancelParsing} subHeader={loadedFiles[0]}>
        <HeadTable head={columns} rows={parsedHead.slice(1)}></HeadTable>
        <div className="ui indeterminate inline text loader">
          <h2 className="ui header">
            {activity}
            <div className="sub header">{numRecordsParsed} records parsed, {numRecordsSkipped} invalid records skipped.</div>
          </h2>
        </div>
      </Dimmer>
    )
  }

  render() {
    const {loadedFiles, parseData, data, ...other} = this.props;

    return (
      <div>
        <FileInput {...other} />
        {this.renderFileOptions()}
      </div>
    );
  }
}


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
