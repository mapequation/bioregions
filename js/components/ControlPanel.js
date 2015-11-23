import React, {Component, PropTypes} from 'react';
import FileLoader from './FileLoader';
import Infomap from './Infomap';
import Binning from './Binning';
import Export from './Export';
import {BY_NAME, BY_CLUSTER} from '../constants/Display';
import InlineForm from './InlineForm';
import TangleInput from './TangleInput';
import Checkbox from './Checkbox';
import Tooltip from './Tooltip';

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
        <div className="ui compact basic buttons">
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
    const {files, data, worldmap, actions} = this.props;
    return (
      <div className="ui styled accordion">
        <div className="active title">
          <i className="dropdown icon"></i>
          Data
        </div>
        <div className="active content">
          <FileLoader {...data} {...files} {...actions} />
          <Binning {...data.binning} binningLoading={data.binningLoading} progressEmitter={data.progressEmitter} {...actions} />
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
          <h4 className="ui dividing header">Map</h4>
          <InlineForm label="Grid resolution">
            <TangleInput className="ui label" suffix="˚"
              value={worldmap.graticuleStep}
              min={1}
              max={180}
              step={1}
              onChange={(value) => actions.changeGraticuleStep(value)} />
          </InlineForm>
          <p></p>
          <Checkbox label="Show grid" checked={worldmap.showGraticules} onChange={actions.changeShowGraticules}></Checkbox>
          <Checkbox label="Clip to land" checked={worldmap.clipToLand} onChange={actions.changeClipToLand}></Checkbox>
          <Checkbox label="Show cell borders" checked={worldmap.showCellBorders} onChange={actions.changeShowCellBorders}></Checkbox>
          <h4 className="ui dividing header">Export</h4>
          <Export {...data} {...files} {...worldmap}></Export>
        </div>
      </div>
    );
  }
}

ControlPanel.propTypes = {
  files: PropTypes.object.isRequired,
  data: PropTypes.object.isRequired,
  worldmap: PropTypes.object.isRequired,
  actions: PropTypes.object.isRequired,
};

export default ControlPanel;
