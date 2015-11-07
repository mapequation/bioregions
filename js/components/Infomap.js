import React, {Component, PropTypes} from 'react';
import FileInput from './FileInput'
import classNames from 'classnames';

class Infomap extends Component {
  constructor(props) {
    super(props);
  }

  render() {
    const {isClustering, runInfomap} = this.props;
    let classes = classNames("ui button", { loading: isClustering });
    return (
      <div>
        <button className={classes} disabled={isClustering ? "disabled" : false} onClick={runInfomap}>
          Cluster...
        </button>
      </div>
    );
  }
}

Infomap.propTypes = {
  isClustering: PropTypes.bool.isRequired,
  runInfomap: PropTypes.func.isRequired,
};

export default Infomap;
