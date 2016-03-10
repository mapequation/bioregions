import React, {Component, PropTypes} from 'react';
import PieChart from './PieChart';
import R from 'ramda';
import {BY_NAME, BY_CLUSTER} from '../constants/Display';

class Statistics extends Component {

  static propTypes = {
    species: PropTypes.array.isRequired,
    clusters: PropTypes.array.isRequired,
    clustersPerSpecies: PropTypes.object.isRequired,
    clusterColors: PropTypes.array.isRequired,
    selectedCluster: PropTypes.number.isRequired,
    selectCluster: PropTypes.func.isRequired,
    selectSpecies: PropTypes.func.isRequired,
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

  handleClickSpecies = (e) => {
    this.props.selectSpecies(e.currentTarget.getAttribute("name"));
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
              <tr key={name} name={name} onClick={this.handleClickSpecies}>
                <td>{name}</td>
                <td>{count}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan="2">
                {this.renderShowMore(numLimited)}
              </th>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }

  renderSpeciesCountsWithClusters() {
    let { limit, filter } = this.state;
    let { species, clustersPerSpecies } = this.props;
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
              <th colSpan="2">{`${numFilteredSpecies} / ${species.length}`}</th>
            </tr>
            <tr>
              <th className="">Name</th>
              <th className="sorted descending">Count</th>
              <th className="">Regions</th>
            </tr>
          </thead>
          <tbody>
            {selection.map(({name, count}) => {
              return (
                <tr key={name} name={name} onClick={this.handleClickSpecies}>
                  <td>{name}</td>
                  <td>{count}</td>
                  <td>{this.renderClusterDistribution(name)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan="2">
                {this.renderShowMore(numLimited)}
              </th>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }

  renderClusterDistribution(name) {
    const {clustersPerSpecies, clusterColors} = this.props;
    const speciesClusters = clustersPerSpecies[name];
    if (!speciesClusters) {
      return (
        <span>-</span>
      );
    }
    const {count, clusters} = speciesClusters; // clusters: [{clusterId, count}, ...]

    return (
      <PieChart size={30} data={clusters} colors={clusterColors} />
    );
  }

  handleClickCluster(clusterId) {
    const {unselectCluster, selectCluster, selectedCluster} = this.props;
    if (clusterId === selectedCluster)
      unselectCluster(clusterId);
    else
      selectCluster(clusterId);
  }


  renderCluster(cluster) {
    const {clusterId, numBins, numRecords, numSpecies, topCommonSpecies, topIndicatorSpecies} = cluster.values;
    const {clusterColors, selectedCluster} = this.props;
    let clusterColor = clusterColors[clusterId];
    let btnBorderColor = clusterColor.darker(0.5).css();
    let style = {
      backgroundColor: clusterColor.css(),
      color: clusterColor.luminance() < 0.5 ? 'white' : 'black',
      border: clusterId === selectedCluster? `2px inset ${btnBorderColor}` : `2px solid ${btnBorderColor}`,
      WebkitPrintColorAdjust: 'exact',
    };
    return (
      <div key={cluster.key} className="ui fluid card">
        <div className="content">
          <div className="ui top attached button" style={style} onClick={() => this.handleClickCluster(clusterId)}>
            {`Bioregion ${clusterId + 1}`}
          </div>
          <div className="description">
            <strong>{numRecords}</strong> records of <strong>{numSpecies}</strong> unique species in <strong>{numBins}</strong> cells
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

    const {species, groupBy, clusters} = this.props;
    if (species.length === 0)
      return (<div></div>)

    if (groupBy == BY_CLUSTER)
      return this.renderClusters();

    if (clusters.length === 0)
      return this.renderSpeciesCounts();

    return this.renderSpeciesCountsWithClusters();
  }
}

export default Statistics;
