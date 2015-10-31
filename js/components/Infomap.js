import React, {Component, PropTypes} from 'react';
import FileInput from './FileInput'

class Infomap extends Component {
  constructor(props) {
    super(props);
  }

  render() {
    const {data, runInfomap} = this.props;
    return (
      <div>
        <button className="ui button" onClick={runInfomap}>Cluster...</button>
      </div>
    );
  }
}

Infomap.propTypes = {
  data: PropTypes.object.isRequired,
  runInfomap: PropTypes.func.isRequired,
};

export default Infomap;
