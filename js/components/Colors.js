import React, {Component, PropTypes} from 'react';
import colors from '../utils/colors';

class Colors extends Component {

  static propTypes = {
    clusters: PropTypes.array.isRequired,
    setClusterColors: PropTypes.func.isRequired,
  }

  regenerateColors = () => {
    const {clusters, setClusterColors} = this.props;
    const count = clusters.length;
    setClusterColors(colors.categoryColors(count, {
      hueMin: 0,
      hueMax: 360,
      chromaMin: 0.3,
      chromaMax: 0.9,
      lightMin: 1.1,
      lightMax: 1.3,
      useForceMode: true,
      quality: 50
    }));
  }

  render() {
    if (this.props.clusters.length === 0)
      return (<span></span>);

    const {clusters, setClusterColors} = this.props;
    var setColors = () => {
      const count = clusters.length;
      console.log("Regenerate colors");
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

    return (
      <button className="ui basic compact button" onClick={setColors}>Regenerate cluster colors</button>
    );
  }
}

export default Colors;
