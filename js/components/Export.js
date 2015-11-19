import React, {Component, PropTypes} from 'react';
import {clusteredBinsToCollectionOfMultiPolygons, clusteredBinsToCollectionOfPolygons} from '../utils/polygons';
import shpWrite from "shp-write"
import R from 'ramda';
import d3 from 'd3';

const MAP_SVG = 'MAP_SVG';
const BIOREGIONS_GEOJSON = 'BIOREGIONS_GEOJSON';
const BIOREGIONS_SHAPEFILE = 'BIOREGIONS_SHAPEFILE';
const CLUSTERS_CSV = 'CLUSTERS_CSV';

class Export extends Component {
  state = {

  }

  saveData(content, filename, type) {
    var blob = new Blob([content], {type}),
        url = window.URL.createObjectURL(blob),
        a = this.downloadAnchor;
    a.href = url;
    a.download = filename;
    a.click();
    // If revoking directly, the file wouldn't be downloaded
    setTimeout(() => {
      window.URL.revokeObjectURL(url);
    }, 100);
  }

  setSave(type, url, filename) {
    if (this.state[type]) {
      URL.revokeObjectURL(this.state[type].url);
    }
  this.setState({[type]: {filename, url}});
  }

  handleSaveMap = () => {
    let data = $('svg')[0].outerHTML;
    data = data.replace('<svg', '<svg version="1.1" baseProfile="full" xmlns="http://www.w3.org/2000/svg"');
    // data = JSON.stringify(data, null, '\t');
    this.saveData(data, 'Infomap-bioregions.svg', 'image/svg+xml;charset=utf-8');
    // this.saveData(data, 'Infomap-bioregions.svg', 'octet/stream');
  }

  handleSaveBioregionsAsGeoJSON = () => {
    var geoJSON = clusteredBinsToCollectionOfMultiPolygons(this.props.bins);
    var data = JSON.stringify(geoJSON, null, '\t');
    this.saveData(data, 'Infomap-bioregions.geojson', 'application/vnd.geo+json');
  }

  handleSaveBioregionsAsShapefile = () => {
    let geoJson = clusteredBinsToCollectionOfPolygons(this.props.bins);
    //TODO: shp-write doesn't support MultiPolygon features!
    shpWrite.download(geoJson); // -> location.href = 'data:application/zip;base64,' + content;
  }

  handleSaveClusters = () => {
    const {clusters, clusterColors} = this.props;
    if (clusters.length == 0)
      return;
    let rows = [];
    clusters.forEach(cluster => {
      const {clusterId, numBins, numSpecies, topCommonSpecies, topIndicatorSpecies} = cluster.values;
      let clusterColor = clusterColors[clusterId];
      R.zip(topCommonSpecies, topIndicatorSpecies).forEach(([common, indicator], i) => {
        rows.push({
          commonSpecies: common.name,
          commonSpeciesCount: common.count,
          indicatorSpecies: indicator.name,
          indicatorSpeciesScore: indicator.score,
          clusterId,
          clusterColor: clusterColor.hex()
        });
      });
    });

    let csvData = d3.csv.format(rows);
    this.saveData(csvData, 'Infomap-bioregions.csv', 'text/csv');
  }

  renderDownloadButtons() {
    const {clusters} = this.props;
    if (clusters.length === 0)
      return (
        <div className="ui vertical basic compact buttons">
          <DownloadButton onClick={this.handleSaveMap} label="Map" type="SVG"></DownloadButton>
        </div>
      );
    return (
      <div className="ui vertical basic compact buttons">
        <DownloadButton onClick={this.handleSaveMap} label="Map" type="SVG"></DownloadButton>
        <DownloadButton onClick={this.handleSaveBioregionsAsGeoJSON} label="Bioregions" type="GeoJSON"></DownloadButton>
        <DownloadButton onClick={this.handleSaveBioregionsAsShapefile} label="Bioregions" type="Shapefile"></DownloadButton>
        <DownloadButton onClick={this.handleSaveClusters} label="Clusters" type="CSV"></DownloadButton>
      </div>
    );
  }

  render() {
    return (
      <div>
        <a ref={(el) => {this.downloadAnchor = el}} style={{display: 'none'}}>download element</a>
        {this.renderDownloadButtons()}
      </div>
    );
  }
}

var DownloadButton = ({onClick, label, type}) => (
    <button className="ui very basic compact button" onClick={onClick}>{label}
      <a className="ui mini tag label">{type}</a>
    </button>
);
DownloadButton.propTypes = {
  onClick: PropTypes.func.isRequired,
  label: PropTypes.string.isRequired,
  type: PropTypes.string.isRequired,
}

Export.propTypes = {
  bins: PropTypes.array.isRequired,
  clusters: PropTypes.array.isRequired,
  clusterColors: PropTypes.array.isRequired,
};

export default Export;
