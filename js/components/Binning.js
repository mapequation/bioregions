import React, {Component, PropTypes} from 'react';
import TangleInput from './TangleInput';

class Binning extends Component {

  static propTypes = {
    binnerType: PropTypes.string.isRequired,
    binnerTypes: PropTypes.array.isRequired,
    minNodeSize: PropTypes.number,
    maxNodeSize: PropTypes.number,
    densityThreshold: PropTypes.number,
    changeBinnerType: PropTypes.func.isRequired,
    changeMinBinSize: PropTypes.func.isRequired,
    changeMaxBinSize: PropTypes.func.isRequired,
    changeDensityThreshold: PropTypes.func.isRequired,
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

  render() {
    return (
      <table className="ui celled table">
        <thead>
          <tr>
            <th colSpan="2">
              Binning
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Max bin size</td>
            <td className="">
              <TangleInput className="ui label" suffix="˚"
                value={this.props.maxNodeSize}
                min={this.props.minNodeSize}
                max={100}
                step={0.1}
                onChange={(value) => this.props.changeMaxBinSize(value)} />
            </td>
          </tr>

          <tr>
            <td>Min bin size</td>
            <td className="">
              <TangleInput className="ui label" suffix="˚"
                value={this.props.minNodeSize}
                min={0.1}
                max={this.props.maxNodeSize}
                step={0.1}
                onChange={(value) => this.props.changeMinBinSize(value)} />
            </td>
          </tr>

          <tr>
            <td>Density threshold</td>
            <td className="">
              <TangleInput className="ui label"
                value={this.props.densityThreshold}
                min={5}
                max={1000000}
                logStep={1}
                onChange={(value) => this.props.changeDensityThreshold(value)} />
            </td>
          </tr>
        </tbody>
      </table>
    );
  }

  renderForm() {
    return (
      <div className="ui form">
        <div className="inline field">
          <label>Type</label>
          {this.renderTypes()}
        </div>
        <div className="inline field">
          <label>Max bin size</label>
          <TangleInput className="ui label"
            value={this.props.maxNodeSize}
            min={this.props.minNodeSize}
            max={100}
            step={0.1}
            suffix="˚"
            asdf="asdf"
            onChange={(value) => this.props.changeMaxBinSize(value)} />
        </div>
        <div className="inline field">
          <label>Min bin size</label>
          <TangleInput className="ui label"
            value={this.props.minNodeSize}
            min={0.1}
            max={this.props.maxNodeSize}
            step={0.1}
            suffix="degrees"
            onChange={(value) => this.props.changeMinBinSize(value)} />
        </div>
        <div className="inline field">
          <label>Density threshold</label>
          <TangleInput className="ui label"
            value={this.props.densityThreshold}
            min={5}
            max={1000000}
            logStep={1}
            onChange={(value) => this.props.changeDensityThreshold(value)} />
        </div>
      </div>
    );
  }
}

export default Binning;
