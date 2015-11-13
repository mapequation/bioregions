import React, {Component, PropTypes} from 'react';
import R from 'ramda';
import {BY_NAME, BY_CLUSTER} from '../constants/Display';

class Statistics extends Component {

  static propTypes = {
    species: PropTypes.array.isRequired,
    clusters: PropTypes.array,
  }

  state = {
    limit: 1000,
    filter: ""
  }

  componentDidMount() {
    // TODO: tablesort undefined here
    // $('.sortable.table').tablesort();
  }

  handleFilterChange = (e) => {
    this.setState({filter: e.target.value});
  }

  renderShowMore(numLimited) {
    if (numLimited <= 0)
      return (
        <div></div>
      );
    return (
      <div>
        {numLimited} more...
      </div>
    );
  }

  renderSpeciesCounts() {
    let { limit, filter } = this.state;
    let { species } = this.props;
    let regFilter = new RegExp(filter, 'i');
    // let selection = R.pipe(
    //   species,
    //   R.filter(({name}) => regFilter.test(name)),
    //   // R.take(limit)
    // );
    let selection = species.filter(({name}) => regFilter.test(name));
    let numFilteredSpecies = selection.length;
    let numLimited = numFilteredSpecies - limit;
    if (numLimited > 0)
      selection = R.take(limit, selection);
    return (
      <div>
        <table className="ui sortable celled table">
          <thead>
            <tr>
              <th>
                <div className="ui form">
                  <input type="text" placeholder="Filter..." value={filter} onChange={this.handleFilterChange} />
                </div>
              </th>
              <th>{`${numFilteredSpecies} / ${species.length}`}</th>
            </tr>
            <tr>
              <th className="">Name</th>
              <th className="sorted descending">Count</th>
            </tr>
          </thead>
          <tbody>
            {selection.map(({name, count}) => (
              <tr key={name}>
                <td>{name}</td>
                <td>{count}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colspan="2">
                {this.renderShowMore(numLimited)}
              </th>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }

  renderCluster(cluster) {
    const {numBins, numSpecies, topCommonSpecies, topIndicatorSpecies} = cluster.values;
    return (
      <div key={cluster.key} className="ui fluid card">
        <div className="content">
          <div className="ui top attached button" style={{backgroundColor: "#1f77b4"}}>
            {topIndicatorSpecies[0].name}, ...
          </div>
          <div className="description">
            <strong>{numSpecies}</strong> species in <strong>{numBins}</strong> bins
          </div>
          <table className="ui very basic compact celled table">
            <thead>
              <tr>
                <th colSpan="2" className="center aligned">Most common species</th>
                <th colSpan="2" className="center aligned">Most indicative species</th>
              </tr>
              <tr>
                <th>Name</th>
                <th>Count</th>
                <th>Name</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {
                R.zip(topCommonSpecies, topIndicatorSpecies).map(([common, indicator], i) => {
                  return (
                    <tr key={`${cluster.key}-${i}`}>
                      <td className="name">{common.name}</td>
                      <td className="value">{common.count}</td>
                      <td className="name">{indicator.name}</td>
                      <td className="value">{indicator.score.toPrecision(3)}</td>
                    </tr>
                  );
                })
              }
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  renderClusters() {
    const {clusters} = this.props;
    return (
      <div className="ui cards">
        {clusters.map((cluster) => this.renderCluster(cluster))}
      </div>
    )
  }

  render() {

    const {species, groupBy} = this.props;
    if (species.length === 0)
      return (<div></div>)

    if (groupBy == BY_CLUSTER)
      return this.renderClusters();

    return this.renderSpeciesCounts();
  }
}

export default Statistics;
