import React, {Component, PropTypes} from 'react';
import {connect} from 'react-redux';
import {bindActionCreators} from 'redux';
import FileLoader from './FileLoader';
import WorldMap from '../components/WorldMap';
import * as fileLoaderActions from '../actions/FileLoaderActions';

class App extends Component {
  constructor(props) {
    super(props);
  }

  render() {
    const {data, files, worldmap, errorMessage, actions} = this.props;
    return (
      <div className="ui container">
        <header><i className="globe icon"></i> Infomap Bioregions</header>
        <main>
          <FileLoader {...files} {...actions} />
          <WorldMap {...worldmap} />
        </main>
      </div>
    );
  }
}

App.propTypes = {
  files: PropTypes.object.isRequired,
  data: PropTypes.object.isRequired,
  worldmap: PropTypes.object.isRequired,
  errorMessage: PropTypes.string,
  actions: PropTypes.object.isRequired,
};

function mapStateToProps(state) {
  return state;
}

function mapDispatchToProps(dispatch) {
  return {
    actions: bindActionCreators(Object.assign({}, fileLoaderActions), dispatch)
  };
}

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(App);
