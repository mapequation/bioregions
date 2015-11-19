import React, {Component, PropTypes} from 'react';
import TangleInput from './TangleInput';
import classNames from 'classnames';
import {BINNING_PROGRESS} from '../constants/ActionTypes';

class Binning extends Component {

  static propTypes = {
    binnerType: PropTypes.string.isRequired,
    binnerTypes: PropTypes.array.isRequired,
    minNodeSizeLog2: PropTypes.number,
    maxNodeSizeLog2: PropTypes.number,
    nodeCapacity: PropTypes.number,
    lowerThreshold: PropTypes.number,
    changeBinnerType: PropTypes.func.isRequired,
    changeMinBinSize: PropTypes.func.isRequired,
    changeMaxBinSize: PropTypes.func.isRequired,
    changeNodeCapacity: PropTypes.func.isRequired,
    changeLowerThreshold: PropTypes.func.isRequired,
    binningLoading: PropTypes.bool.isRequired,
    progressEmitter: PropTypes.object.isRequired,
  }

  state = {
    percentLoaded: null,
  }

  componentDidMount() {
    const {progressEmitter} = this.props;
    progressEmitter.on(BINNING_PROGRESS, (action) => {
      const {type, activity, mode, amount, meta} = action;
      this.setState({
        activity,
        amount,
        total: meta.total
      });
    });
  }

  renderTypes() {
    // <select className="ui dropdown min-content">
    //   <option value="">option1</option>
    //   <option value="">option2</option>
    // </select>
    return (
      <span>{this.props.binnerType}</span>
    )
  }

  renderTypesSelection() {
    if (this.props.binnerTypes.length === 1)
      return (<tr></tr>);
    return (
      <tr>
        <td>Type</td>
        <td>
          <select className="ui dropdown">
            {this.props.binnerTypes.map(binner => (
              <option key={binner} value={binner}>{binner}</option>
            ))}
          </select>
        </td>
      </tr>
    );
  }

  formatBinSize(sizeLog2) {
    return sizeLog2 < 0? `1/${Math.pow(2, -sizeLog2)}` : `${Math.pow(2, sizeLog2)}`;
  }

  render() {
    let progressClasses = classNames("ui celled table", {
      yellow: this.props.binningLoading,
      green: !this.props.binningLoading,
    });
    const {amount, total} = this.state;
    const percentLoaded = total? `${Math.round(amount*100/total)}%` : "100%";
    return (
      <div className="ui segment" style={{padding: 0}}>
        <div className="ui top attached progress">
          <div className="bar" style={{width: percentLoaded}}></div>
        </div>
        <div className="ui basic segment" style={{paddingBottom: 0}}>
          <h4 className="ui header">Binning
            <span> </span>
            {this.props.binningLoading? (
              <div className="ui active small inline loader"></div>
            ) : (
              <span></span>
            )}
          </h4>
        </div>
        <table className="ui basic table">
          <tbody>
            {this.renderTypesSelection()}
            <tr>
              <td>Max bin size</td>
              <td className="">
                <TangleInput className="ui label" suffix="˚"
                  value={this.props.maxNodeSizeLog2}
                  min={this.props.minNodeSizeLog2}
                  max={6}
                  format={this.formatBinSize}
                  speed={0.2}
                  onChange={(value) => this.props.changeMaxBinSize(value)} />
              </td>
            </tr>

            <tr>
              <td>Min bin size</td>
              <td className="">
                <TangleInput className="ui label" suffix="˚"
                  value={this.props.minNodeSizeLog2}
                  min={-3}
                  max={this.props.maxNodeSizeLog2}
                  format={this.formatBinSize}
                  speed={0.2}
                  onChange={(value) => this.props.changeMinBinSize(value)} />
              </td>
            </tr>

            <tr>
              <td>Bin capacity</td>
              <td className="">
                <TangleInput className="ui label"
                  value={this.props.nodeCapacity}
                  min={5}
                  max={1000000}
                  logStep={1}
                  speed={0.2}
                  onChange={(value) => this.props.changeNodeCapacity(value)} />
              </td>
            </tr>

            <tr>
              <td>Lower threshold</td>
              <td className="">
                <TangleInput className="ui label"
                  value={this.props.lowerThreshold}
                  min={0}
                  max={1000000}
                  logStep={1}
                  speed={0.2}
                  onChange={(value) => this.props.changeLowerThreshold(value)} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }
}

export default Binning;
