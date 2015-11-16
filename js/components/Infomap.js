import React, {Component, PropTypes} from 'react';
import FileInput from './FileInput'
import classNames from 'classnames';

class Infomap extends Component {

  static propTypes = {
    bins: PropTypes.array.isRequired,
    isClustering: PropTypes.bool.isRequired,
    getClusters: PropTypes.func.isRequired,
  }

  render() {
    const {bins, isClustering, getClusters} = this.props;
    let classes = classNames("ui button", { loading: isClustering });
    if (bins.length === 0)
      return <div></div>;
    return (
      <div>
        <button className={classes}
          disabled={isClustering ? "disabled" : false}
          onClick={() => getClusters()}>
          Cluster...
        </button>
      </div>
    );
  }
}

export default Infomap;
