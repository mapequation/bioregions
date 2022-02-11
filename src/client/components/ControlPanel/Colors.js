import PropTypes from 'prop-types';
import React, { Component } from 'react';
import colors from '../../utils/colors';

class Colors extends Component {

  static propTypes = {
    count: PropTypes.number.isRequired,
    setClusterColors: PropTypes.func.isRequired,
  }

  regenerateColors = () => {
    const {count, setClusterColors} = this.props;
    setClusterColors(colors.categoryColors(count, {
      hueMin: 0,
      hueMax: 360,
      chromaMin: 0.3,
      chromaMax: 0.9,
      lightMin: 0.9,
      lightMax: 1.2,
      useForceMode: false,
      quality: 50
    }));
  }

  render() {
    if (this.props.count === 0)
      return (<span></span>);

    return (
      <button className="ui basic compact button" onClick={this.regenerateColors}>Regenerate cluster colors</button>
    );
  }
}

export default Colors;
