import React, {Component, PropTypes} from 'react';
import PieChart from './PieChart';
import R from 'ramda';
import _ from 'lodash';
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
    changeGroupBy: PropTypes.func.isRequired,
  }

  state = {
    limitSpecies: 100,
    limitClusters: 100,
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

  getLimitThresholds(maxValue) {
    let thresholds = [10, 50, 100, 500, 1000];
    let limitIndex = _.sortedIndex(thresholds, maxValue);
    if (limitIndex === thresholds.length)
        return thresholds; // Hard limit
    thresholds = _.take(thresholds, limitIndex);
    thresholds.push(maxValue);
    return thresholds;
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
    let { limitSpecies, filter } = this.state;
    if (this.props.clusters.length > 0)
      return this.renderSpeciesCountsWithClusters();

    let { species } = this.props;
    let regFilter = new RegExp(filter, 'i');
    // let selection = R.pipe(
    //   species,
    //   R.filter(({name}) => regFilter.test(name)),
    //   // R.take(limitSpecies)
    // );
    let selection = species.filter(({name}) => regFilter.test(name));
    let numFilteredSpecies = selection.length;
    let numLimited = numFilteredSpecies - limitSpecies;
    if (numLimited > 0)
      selection = R.take(limitSpecies, selection);
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
    let { limitSpecies, filter } = this.state;
    let { species, clustersPerSpecies } = this.props;
    let regFilter = new RegExp(filter, 'i');
    // let selection = R.pipe(
    //   species,
    //   R.filter(({name}) => regFilter.test(name)),
    //   // R.take(limitSpecies)
    // );
    let selection = species.filter(({name}) => regFilter.test(name));
    let numFilteredSpecies = selection.length;
    let numLimited = numFilteredSpecies - limitSpecies;
    if (numLimited > 0)
      selection = R.take(limitSpecies, selection);
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

    if (clusters.length === 0)
      return <div></div>;

    const limit = this.state.limitClusters;
    const clustersToShow = _.take(clusters, limit);
    const numIgnored = clusters.length - limit;
    const clustersToIgnore = _.takeRight(clusters, numIgnored);
    const ignored = _.reduce(clustersToIgnore, (sum, {values: {numBins, numRecords}}) => {
      sum.numBins += numBins; sum.numRecords += numRecords;
      return sum;
    }, { numBins: 0, numRecords: 0 });

    const IgnoredClustersSummary = numIgnored === 0 ? (<div></div>) : (
      <div key="ignoredClusters" className="ui fluid card">
        <div className="content">
          <div className="description">
            <strong>{numIgnored}</strong> more bioregions with total <strong>{ignored.numRecords}</strong> records of species in <strong>{ignored.numBins}</strong> cells
          </div>
        </div>
      </div>
    );

    return (
      <div className="ui cards">
        {clustersToShow.map(cluster => this.renderCluster(cluster))}
        {IgnoredClustersSummary}
      </div>
    )
  }

  renderSelectGroupBy() {
    const {species, groupBy, clusters, changeGroupBy} = this.props;
    const {limitSpecies, limitClusters} = this.state;
    if (clusters.length == 0)
      return (<span></span>);

    const availableGroupings = [BY_NAME, BY_CLUSTER];

    return (
      <div className="ui form" style={{display: 'inline-block', marginRight: '10px'}}>
        <div className="inline fields">
          <label>Statistics by</label>
          <div className="field">
            <div className="ui compact basic buttons">
              {availableGroupings.map((grouping) => (
                <button key={grouping}
                  className={`ui button ${grouping === groupBy? "active" : ""}`}
                  onClick={() => changeGroupBy(grouping)}>{grouping}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  handleChangeLimit = (event) => {
    const limit = event.target.value;
    if (this.props.groupBy == BY_NAME)
      this.setState({limitSpecies: limit});
    else
      this.setState({limitClusters: limit});
  }

  renderSelectLimit() {
    const {species, groupBy, clusters} = this.props;
    const {limitSpecies, limitClusters} = this.state;

    const currentLimit = groupBy === BY_NAME ? limitSpecies : limitClusters;
    const currentMax = groupBy === BY_NAME ? species.length : clusters.length;
    const limitThresholds = this.getLimitThresholds(currentMax);

    if (limitThresholds.length <= 1)
      return <span></span>;

    const suffix = `of ${currentMax}`

    return (
      <div className="ui form" style={{display: 'inline-block', marginRight: '10px'}}>
        <div className="inline fields">
          <label>Show</label>
          <div className="field">
            <select className="ui fluid dropdown" value={currentLimit} onChange={this.handleChangeLimit}>
              {
                limitThresholds.map((threshold, i) => (
                  <option key={i} value={threshold}>{threshold}</option>
                ))
              }
            </select>
          </div>
          <div className="field">
            {`of ${currentMax} ${ groupBy === BY_NAME ? "species" : "clusters" }`}
          </div>
        </div>
      </div>
    );
  }

  render() {
    const {species, groupBy, clusters} = this.props;
    if (species.length === 0)
      return (<div></div>);

    return (
      <div>
        { this.renderSelectGroupBy() }
        { this.renderSelectLimit() }
        { groupBy === BY_CLUSTER ?
          this.renderClusters() :
          this.renderSpeciesCounts()
        }
      </div>
    );
  }
}

export default Statistics;
