import React, {Component, PropTypes} from 'react';
import FileLoader from './FileLoader';
import Infomap from './Infomap';
import Binning from './Binning';
import {BY_NAME, BY_CLUSTER} from '../constants/Display';

class ControlPanel extends Component {
  constructor(props) {
    super(props);
  }

  componentDidMount() {
    $('.ui.accordion').accordion();
  }

  renderSelectGroupBy() {
    const {data, actions} = this.props;
    if (data.clusterIds.length == 0)
      return (<div></div>);

    let availableGroupings = [BY_NAME, BY_CLUSTER];

    // return (
    //   <div className="field">
    //     <select className="ui dropdown" value={BY_CLUSTER}>
    //       <option value={BY_NAME}>BY_NAME</option>
    //       <option value={BY_CLUSTER}>BY_CLUSTER</option>
    //     </select>
    //   </div>
    // )

    return (
      <div class="field">
        <label>Statistics by</label>
        <div className="ui basic buttons mini">
          {availableGroupings.map((grouping) => (
            <button key={grouping}
              className={`ui button ${grouping == data.groupBy? "active" : ""}`}
              onClick={() => actions.changeGroupBy(grouping)}>{grouping}</button>
          ))}
        </div>
      </div>
    )


    // return (
    //   <div class="field">
    //     <label>Group by</label>
    //     <select className="ui fluid dropdown" value={data.groupBy}>
    //       {availableGroupings.map(grouping => {
    //         console.log(`option: ${grouping}, data.groupBy: ${data.groupBy} => selected: ${grouping == data.groupBy}`);
    //         return (
    //           <option key={grouping} value={grouping}>{grouping}</option>
    //         );
    //       })}
    //     </select>
    //   </div>
    // );
  }

  render() {
    const {files, data, actions} = this.props;
    return (
      <div className="ui styled accordion">
        <div className="active title">
          <i className="dropdown icon"></i>
          Data
        </div>
        <div className="active content">
          <FileLoader {...files} {...actions} />
          <Binning {...data.binning} {...actions} />
          <Infomap {...data} {...actions} />
        </div>
        <div className="title">
          <i className="dropdown icon"></i>
          Display
        </div>
        <div className="content">
          <div className="ui form">
            {this.renderSelectGroupBy()}
          </div>
          <h4 class="ui dividing header">Export</h4>
          <button className="ui basic button dropdown">Map...</button>
        </div>
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
