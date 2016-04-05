import React, { PropTypes } from 'react'
import Tooltip from '../lib/Tooltip';
import Div from '../helpers/Div';
import Colors from './Colors';
import {BY_NAME, BY_CLUSTER} from '../../constants/Display';

class MapControl extends React.Component {
  static propTypes = {
    clusters: PropTypes.array.isRequired,
    setClusterColors: PropTypes.func.isRequired,
    mapBy: PropTypes.oneOf([BY_NAME, BY_CLUSTER]).isRequired,
    changeMapBy: PropTypes.func.isRequired,
  }


  renderSelectMapBy() {
    const {clusters, mapBy, changeMapBy} = this.props;
    // if (clusters.length == 0)
    //   return (<span></span>);

    const availableGroupings = [BY_NAME, BY_CLUSTER];
    const naming = { [BY_NAME]: "heatmap", [BY_CLUSTER]: "clusters" };

    return (
      <Div className="ui form" display="inline-block" marginRight="10px">
        <div className="field">
          <label>Show</label>
          <div className="ui compact basic buttons">
            {availableGroupings.map((grouping) => (
              <button key={grouping}
                className={`ui button ${grouping === mapBy? "active" : ""}`}
                onClick={() => changeMapBy(grouping)}>{naming[grouping]}</button>
            ))}
          </div>
        </div>
      </Div>
    );
  }

  render () {
    const { clusters } = this.props;
    if (clusters.length === 0)
      return <span></span>

    return (
      <div>
        <div className="ui horizontal divider">Map</div>
        { this.renderSelectMapBy() }
        <Div padding="10px 0">
          <Colors count={clusters.length} setClusterColors={this.props.setClusterColors}/>
        </Div>
      </div>
    )
  }
}

export default MapControl;
