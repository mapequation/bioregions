import PropTypes from 'prop-types';
import React, { Component } from 'react';
import axios from 'axios';

class SpeciesInfo extends Component {

  static propTypes = {
    species: PropTypes.string.isRequired,
    onHide: PropTypes.func.isRequired,
  }

  state = {
    imageUrl: "",
  }

  componentDidMount() {
    // http://eol.org/api/search/1.0.json?q=Ursus&page=1&exact=false&filter_by_taxon_concept_id=&filter_by_hierarchy_entry_id=&filter_by_string=&cache_ttl=
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.species !== this.currentSpecies) {
      this.fetchSpeciesInfo(nextProps.species);
    }
  }

  fetchSpeciesInfo(species) {
    this.currentSpecies = species;
    this.currentUrl = "";
    if (!species)
      return;
    return; //TODO: Fix CORS
    const requestURL = `http://eol.org/api/search/1.0.json?q=${window.encodeURI(species)}&page=1&exact=true`;
        // 'Access-Control-Allow-Origin': 'http://eol.org',
    const config = {
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'Access-Control-Allow-Origin': '*',
      }
    };
    axios.get(requestURL, config)
      .then(response => {
        console.log("EOL Response:", response.data);
      })
      .catch(response => {
        console.log("Error fetching EOL info:", response);
        this.setState({error: "Error fetching species info: " + response.statusText});
      });
  }

  renderImage() {
    return (
      <div className="ui segment">
        <img src={this.state.imageUrl}></img>
      </div>
    );
  }

  renderLoading() {
    return (
      <div className="ui loading segment"></div>
    );
  }

  // <img ref={(el) => {this.image = el}} width="300" height="300"></img>
  render() {
    if (!this.props.species || true) // TODO: Fix CORS
      return (<span></span>);
    return (
      <div className="ui inverted active page dimmer" style={{overflow: 'auto'}}>
        <div className="ui container" style={{background: "white"}}>
          <h1 className="ui header">
            {this.props.species}
            <div className="sub header"></div>
          </h1>

          {this.state.imageUrl? this.renderImage() : this.renderLoading()}

          <div className="ui divider"></div>
          <button className="ui very basic button" tabIndex="0" onClick={this.props.onHide}>Back</button>
        </div>
      </div>
    );
  }
}

export default SpeciesInfo;
