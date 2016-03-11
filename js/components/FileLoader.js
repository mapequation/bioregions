import React, {Component, PropTypes} from 'react';
import _ from 'lodash';
import FileInput from './FileInput'
import {FILE_PROGRESS} from '../constants/ActionTypes';
import R from 'ramda';
import {INDETERMINATE, PERCENT, COUNT, COUNT_WITH_TOTAL} from '../actions/ProgressActions';

const getInitialState = () => {
  return {
    fieldMappingSubmitted: false,
    nameFieldSubmitted: false,
    fieldsToColumns: {
      Name: 0,
      Latitude: 1,
      Longitude: 2,
    },
    nameField: "",
    guessedColumns: false,
    progress: null,
    done: false,
  }
};

class FileLoader extends Component {

  static propTypes = {
    isShowingFileUI: PropTypes.bool.isRequired,
    isLoading: PropTypes.bool.isRequired,
    files: PropTypes.array.isRequired,
    sampleFiles: PropTypes.array.isRequired,
    parsedHead: PropTypes.array.isRequired,
    parsedFeatureProperty: PropTypes.object,
    showFileUI: PropTypes.func.isRequired,
    loadFiles: PropTypes.func.isRequired,
    loadSampleFiles: PropTypes.func.isRequired,
    loadTree: PropTypes.func.isRequired,
    progressEmitter: PropTypes.object.isRequired,
    setFieldsToColumnsMapping: PropTypes.func.isRequired,
    setFeatureNameField: PropTypes.func.isRequired,
  };

  state = getInitialState();

  componentDidMount() {
    const {progressEmitter} = this.props;
    progressEmitter.on(FILE_PROGRESS, (action) => {
      this.setState({
        progress: action
      });
    });
  }

  componentWillReceiveProps(nextProps) {
    const {parsedHead, parsedFeatureProperty} = nextProps;

    const haveDSV = parsedHead.length > 0
    const haveFeatures = !!parsedFeatureProperty;
    if (haveDSV || haveFeatures) {
      this.setState(getInitialState());
      if (haveDSV)
        this.guessColumns(parsedHead);
      else
        this.guessFeatureNameField(parsedFeatureProperty);
    }
  }

  guessColumns(parsedHead) {

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

    const columns = parsedHead[0];

    let [nameIndex, latIndex, longIndex] = getMatchingColumns(columns);
    this.setState({
      fieldsToColumns: {
        Name: nameIndex,
        Latitude: latIndex,
        Longitude: longIndex,
      },
      guessedColumns: true
    });
  }

  guessFeatureNameField(parsedFeatureProperty) {
    console.log("Guess feature name field from:", parsedFeatureProperty);
    let keys = R.keys(parsedFeatureProperty);
    keys = keys.filter(key => key !== "OBJECTID");
    this.setState({nameField: keys[0]});
  }

  cancelParsing = () => {
    this.setState(getInitialState());
    this.props.cancelFileActions();
  }

  changeFieldMap = (fieldMap) => {
    let fieldsToColumns = Object.assign({}, this.state.fieldsToColumns, fieldMap);
     this.setState({
       fieldsToColumns
     });
  }

  changeNameField = (nameField) => {
     this.setState({
       nameField
     });
  }

  submitFieldsMap = () => {
    this.setState({
      fieldMappingSubmitted: true
    });

    const {fieldsToColumns} = this.state;
    this.props.setFieldsToColumnsMapping(fieldsToColumns);
  }

  submitNameField = () => {
    this.setState({
      nameFieldSubmitted: true
    });

    this.props.setFeatureNameField(this.state.nameField);
  }

  ErrorMessage = ({message, subMessage, children}) => (
    <Dimmer onCancel={this.cancelParsing}>
      <div>
        {children}
        <div className="ui negative message">
          <div className="header">
            {message}
          </div>
          {subMessage}
        </div>
      </div>
    </Dimmer>
  );

  renderGeoJSONFileOptions() {
    const {files, parsedFeatureProperty, error, message, subMessage} = this.props;
    const {nameField, nameFieldSubmitted} = this.state;

    const ErrorMessage = this.ErrorMessage;

    if (error) {
      if (!parsedFeatureProperty)
        return (
          <ErrorMessage message={message} subMessage={subMessage}>
          </ErrorMessage>
        );

      return (
        <ErrorMessage message={message} subMessage={subMessage}>
          <HeadTable head={R.keys(parsedFeatureProperty)} rows={[R.values(parsedFeatureProperty)]}></HeadTable>
        </ErrorMessage>
      );

    }

    const subHeader = files.map(file => file.name).join(",\n");

    if (!nameFieldSubmitted) {
      const selectOptions = R.keys(parsedFeatureProperty).map((field, i) => (<option key={i} value={field}>{field}</option>));
      return (
        <Dimmer onCancel={this.cancelParsing} subHeader={subHeader}>
          <div>
            <HeadTable head={R.keys(parsedFeatureProperty)} rows={[R.values(parsedFeatureProperty)]}></HeadTable>
            <h2 className="ui header">Select name field</h2>
            <div className="ui center aligned container grid">
              <div className="ui compact segment">
                <table className="ui very basic collapsing celled table">
                  <tbody>
                    <tr>
                      <td>Name</td>
                      <td>
                        <select value={nameField} onChange={(e) => {this.changeNameField(e.target.value)}}>
                          {selectOptions}
                        </select>
                      </td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan="2" className="right aligned">
                        <button type="submit" className="ui basic button" onClick={this.submitNameField}>Submit</button>
                      </th>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </Dimmer>
      );
    }

    const {progress} = this.state;
    if (progress) {
      return (
        <Dimmer onCancel={this.cancelParsing} subHeader={subHeader}>
          <div>
            <HeadTable head={R.keys(parsedFeatureProperty)} rows={[R.values(parsedFeatureProperty)]}></HeadTable>
            <Progress {...progress}></Progress>
          </div>
        </Dimmer>
      );
    }

    let header = files.length > 0? "Loading files..." : "Loading file...";
    return (
      <Dimmer onCancel={this.cancelParsing} subHeader={subHeader}>
        <div>
          <HeadTable head={R.keys(parsedFeatureProperty)} rows={[R.values(parsedFeatureProperty)]}></HeadTable>
          <Loader header={header}></Loader>
        </div>
      </Dimmer>
    );

  }

  renderDSVFileOptions() {
    const {files, parsedHead, parsedFeatureProperty, error, message, subMessage} = this.props;
    const {fieldsToColumns, fieldMappingSubmitted} = this.state;

    const ErrorMessage = this.ErrorMessage;

    if (error) {

      if (parsedHead.length === 0)
        return (
          <ErrorMessage message={message} subMessage={subMessage}>
          </ErrorMessage>
        );

      return (
        <ErrorMessage message={message} subMessage={subMessage}>
          <HeadTable head={parsedHead[0]} rows={parsedHead.slice(1)}></HeadTable>
        </ErrorMessage>
      )
    }

    const subHeader = files[0].name;
    const columns = parsedHead[0];

    // Test
    // if (columns.length > 3) {
    //   return (
    //     <Dimmer onCancel={this.cancelParsing} subHeader={subHeader}>
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

    if (!fieldMappingSubmitted) {
      const selectOptions = columns.map((col, i) => (<option key={i} value={i}>{col}</option>));
      const {Name, Latitude, Longitude} = fieldsToColumns;

      return (
        <Dimmer onCancel={this.cancelParsing} subHeader={subHeader}>
          <div>
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
          </div>
        </Dimmer>
      );
    }

    const {progress} = this.state;
    if (progress) {
      return (
        <Dimmer onCancel={this.cancelParsing} subHeader={subHeader}>
          <div>
            <HeadTable head={columns} rows={parsedHead.slice(1)}></HeadTable>
            <Progress {...progress}></Progress>
          </div>
        </Dimmer>
      );
    }

    let header = files.length > 0? "Loading files..." : "Loading file...";
    return (
      <Dimmer onCancel={this.cancelParsing} subHeader={subHeader}>
        <div>
          <HeadTable head={columns} rows={parsedHead.slice(1)}></HeadTable>
          <Loader header={header}></Loader>
        </div>
      </Dimmer>
    );
  }

  renderFileLoading() {
    const {isShowingFileUI, isLoading, files, parsedHead, parsedFeatureProperty, error, message, subMessage} = this.props;
    const {done} = this.state;
    if (!isShowingFileUI)
      return (<span></span>);

    if (done) { // Will soon be restored to initial state with !isLoading
      return (<span></span>);
    }

    if (parsedHead.length > 0)
      return this.renderDSVFileOptions();

    if (parsedFeatureProperty)
      return this.renderGeoJSONFileOptions();

    const ErrorMessage = this.ErrorMessage;

    if (error) {
      return (
        <ErrorMessage message={message} subMessage={subMessage}>
        </ErrorMessage>
      );
    }

    // Loading file...
    if (isLoading) {
      const subHeader = files.map(file => file.name).join(",\n");
      const {progress} = this.state;
      if (progress) {
        return (
          <Dimmer onCancel={this.cancelParsing} subHeader={subHeader}>
            <Progress {...progress}></Progress>
          </Dimmer>
        );
      }

      let header = files.length > 0? "Loading files..." : "Loading file...";
      return (
        <Dimmer onCancel={this.cancelParsing} subHeader={subHeader}>
          <Loader header={header}></Loader>
        </Dimmer>
      );
    }

    const {sampleFiles, loadFiles, loadSampleFiles} = this.props;
    return (
      <Dimmer onCancel={this.toggleShowFileUI} header={"Load files..."}>
        <div className="ui two column grid">
          <div className="column">
            <div className="ui segment">
              <h2 className="ui header">Species data</h2>

              <FileInput multiple={true} loadFiles={loadFiles}>
                Load species distribution data...
              </FileInput>
              <div className="ui horizontal divider">
                Or
              </div>
              <table className="ui basic selectable celled table">
                <thead>
                  <tr>
                    <th colSpan="3">Load example data:</th>
                  </tr>
                </thead>
                <tbody>
                  {
                    sampleFiles.map((sampleFile, i) => (
                      <tr key={i} onClick={() => loadSampleFiles(sampleFile.filenames)} style={{cursor: 'pointer'}}>
                        <td>{sampleFile.name}</td>
                        <td>{sampleFile.type}</td>
                        <td>{sampleFile.size}</td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          </div>
          <div className="column">
            <div className="ui segment">
              <h2 className="ui header">Phylogenetic data</h2>
              <div>
                <FileInput loadFiles={this.props.loadTree}>
                  Load tree...
                </FileInput>
              </div>
            </div>
          </div>
        </div>
      </Dimmer>
    )
  }

  toggleShowFileUI = () => {
    const {isShowingFileUI, showFileUI} = this.props;
    showFileUI(!isShowingFileUI);
  }

  render() {

    return (
      <div>
        <button className="ui button" onClick={this.toggleShowFileUI}>Load data...</button>
        {this.renderFileLoading()}
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
  children: React.PropTypes.element.isRequired,
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

var Loader = ({header, subHeader}) => (
  <div className="ui indeterminate inline text loader">
    <h2 className="ui header">
      {header}
      <div className="sub header">{subHeader}</div>
    </h2>
  </div>
);
Loader.defaultProps = {
  subHeader: ""
};

var ProgressBar = ({value, total, label}) => {
  const percent = `${Math.round(value*100/total)}%`;
  return (
    <div className="ui indicating progress active" data-value={value} data-total={total}>
      <div className="bar" style={{width: percent, "transitionDuration": "30ms"}}>
        <div className="progress">{percent}</div>
      </div>
      <div className="label">{label}</div>
    </div>
  );
}
ProgressBar.propTypes = {
  value: PropTypes.number.isRequired,
  total: PropTypes.number.isRequired,
  label: PropTypes.string.isRequired,
};
ProgressBar.defaultProps = {
  label: "",
};


var Progress = ({activity, mode, amount, meta}) => {
  if (mode === INDETERMINATE || mode === COUNT) {
    return (
      <Loader header={activity} subHeader={amount? amount : ""}></Loader>
    );
  }
  // console.log(`[Progress]: mode: ${mode}, amount: ${amount}, total: ${meta.total}`);
  return (
    <div>
      <Loader header={activity} subHeader={amount}></Loader>
      <ProgressBar value={amount} total={meta.total}></ProgressBar>
    </div>
  )
}
Progress.propTypes = {
  activity: PropTypes.string.isRequired,
  mode: PropTypes.oneOf([INDETERMINATE, PERCENT, COUNT, COUNT_WITH_TOTAL]).isRequired,
  amount: PropTypes.number,
  meta: PropTypes.object.isRequired,
};

export default FileLoader;
