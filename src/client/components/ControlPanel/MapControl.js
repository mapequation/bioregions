import PropTypes from 'prop-types';
import React from 'react';
import Tooltip from '../lib/Tooltip';
import Div from '../helpers/Div';
import Colors from './Colors';
import {BY_CELL, BY_CLUSTER} from '../../constants/Display';

class MapControl extends React.Component {
  static propTypes = {
    clusters: PropTypes.array.isRequired,
    setClusterColors: PropTypes.func.isRequired,
    mapBy: PropTypes.oneOf([BY_CELL, BY_CLUSTER]).isRequired,
    changeMapBy: PropTypes.func.isRequired,
  }

  render () {
    const { clusters } = this.props;
    if (clusters.length === 0)
      return <span></span>

    return (
      <div>
        <div className="ui horizontal divider">Map</div>
        <Div padding="10px 0">
          <Colors count={clusters.length} setClusterColors={this.props.setClusterColors}/>
        </Div>
      </div>
    )
  }
}

export default MapControl;
