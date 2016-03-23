import React, {Component, PropTypes} from 'react';

/**
* A button that triggers a hidden input element of type file.
* props.loadFiles called with an array of File objects if props.multiple,
* else with a single File object.
*/
class WorldMapDimmer extends Component {

  static propTypes = {
    isShowingFileUI: PropTypes.bool.isRequired,
    showFileUI: PropTypes.func.isRequired,
  }

  toggleShowFileUI = () => {
    const {isShowingFileUI, showFileUI} = this.props;
    showFileUI(!isShowingFileUI);
  }

  render() {
    const {isShowingFileUI} = this.props;
    const dimmerStyle = {
      zIndex: 0,
      opacity: isShowingFileUI? 0 : 1
    };
    return (
      <div className="ui raised dimmable dimmed segment">
        <img className="ui image" src="http://mapequation.org/assets/img/bioregions-amphibians.png" alt="Bioregions example output map" />
        <div className="ui simple inverted dimmer" style={dimmerStyle}>
          <div className="content">
            <div className="center">
              <button className="ui red button" onClick={this.toggleShowFileUI}>Load data...</button>
              <div className="ui horizontal divider">
                Or
              </div>
              <div>
                <h3 className="ui header">
                  <a href="#documentation">
                    <div>Check documentation</div>
                    <i className="angle double down icon"></i>
                  </a>
                </h3>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

}

export default WorldMapDimmer;
