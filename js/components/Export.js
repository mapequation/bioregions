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

  static propTypes = {
    bins: PropTypes.array.isRequired,
    clusters: PropTypes.array.isRequired,
    clusterColors: PropTypes.array.isRequired,
    basename: PropTypes.string.isRequired,
  }

  state = {
    showExport: false,
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
    this.saveData(data, `${this.props.basename}.svg`, 'image/svg+xml;charset=utf-8');
    // this.saveData(data, 'Infomap-bioregions.svg', 'octet/stream');
  }

  handleSaveBioregionsAsGeoJSON = () => {
    var geoJSON = clusteredBinsToCollectionOfMultiPolygons(this.props.bins);
    var data = JSON.stringify(geoJSON, null, '\t');
    this.saveData(data, `${this.props.basename}.geojson`, 'application/vnd.geo+json');
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
    this.saveData(csvData, `${this.props.basename}.csv`, 'text/csv');
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

  // render() {
  //   return (
  //     <div>
  //       <a ref={(el) => {this.downloadAnchor = el}} style={{display: 'none'}}>download element</a>
  //       {this.renderDownloadButtons()}
  //     </div>
  //   );
  // }

  showExport = () => {
    this.setState({showExport: true});
  }

  hideExport = () => {
    this.setState({showExport: false});
  }


  render() {
    return (
      <div>
        <button className="ui button" onClick={this.showExport}>Export...</button>
        {this.state.showExport? (
          <ExportWindow {...this.props} onHide={this.hideExport}></ExportWindow>
        ) : (<i></i>)}
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

class ExportWindow extends Component {
  static propTypes = {
    onHide: PropTypes.func.isRequired,
    basename: PropTypes.string.isRequired,
  }

  componentDidMount() {
    let $svg = $('svg');
    const [width, height] = [$svg.width(), $svg.height()];
    let svgContent = $svg[0].outerHTML;
    console.log("svgContent before:", svgContent.substring(0, 100));
    svgContent = svgContent.replace(/^<svg/, ['<svg',
      'xmlns="http://www.w3.org/2000/svg"',
      'xmlns:xlink="http://www.w3.org/1999/xlink"',
      'version="1.1"'].join(' '));
    console.log("svgContent after:", svgContent.substring(0, 100));

    this.svgURL = this.contentToBase64URL(svgContent, 'image/svg+xml');
    // var svgUrl = contentToBase64URL(svgContent, 'image/svg+xml;charset=utf-8');

    this.canvas.width = width;
    this.canvas.height = height;
    var ctx = this.canvas.getContext('2d');

    var image = new Image(width, height)
    image.onload = () => {
      console.log("Image loaded! Draw to canvas...");
      ctx.drawImage(image, 0, 0);
      this.generateLinks();
    }
    console.log("Set img src to svg...");
    image.src = this.svgURL;

  }

  generateLinks() {
    this.anchorSvg.innerHTML = `${this.props.basename}.svg`;
    this.anchorSvg.download = `${this.props.basename}.svg`;
    this.anchorSvg.target = "_blank";
    this.anchorSvg.href = this.svgURL;

    this.anchorPng.innerHTML = `${this.props.basename}.png`;
    this.anchorPng.download = `${this.props.basename}.png`;
    this.anchorPng.target = "_blank";
    this.anchorPng.href = this.canvas.toDataURL("image/png");


    this.anchorGeoJSON.innerHTML = `${this.props.basename}.geojson`;
    this.anchorGeoJSON.download = `${this.props.basename}.geojson`;
    this.anchorGeoJSON.target = "_blank";
    this.anchorGeoJSON.href = this.contentToBase64URL(this.getGeoJSON(), 'application/vnd.geo+json');

    this.anchorShapefile.innerHTML = `${this.props.basename}_shapefile.zip`;
    this.anchorShapefile.download = `${this.props.basename}_shapefile.zip`;
    this.anchorShapefile.target = "_blank";
    // this.anchorShapefile.href = this.contentToBase64URL(this.getGeoJSON(), 'application/vnd.geo+json');

    this.anchorClustersCSV.innerHTML = `${this.props.basename}.csv`;
    this.anchorClustersCSV.download = `${this.props.basename}.csv`;
    this.anchorClustersCSV.target = "_blank";
    this.anchorClustersCSV.href = this.contentToBase64URL(this.getClustersCSV(), 'text/csv');
  }

  contentToBase64URL(content, type) {
    return 'data:' + type + ';base64,' + window.btoa(content);
  }

  clickDownloadShapefile = () => {
    var geoJSON = clusteredBinsToCollectionOfPolygons(this.props.bins);
    shpWrite.download(geoJSON); // -> location.href = 'data:application/zip;base64,' + content;
  }

  getGeoJSON() {
    var geoJSON = clusteredBinsToCollectionOfMultiPolygons(this.props.bins);
    return JSON.stringify(geoJSON, null, '\t');
  }

  getClustersCSV() {
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
          bioregion: clusterId + 1,
          clusterColor: clusterColor.hex()
        });
      });
    });

    let csvData = d3.csv.format(rows);
    return csvData;
  }

  // <img ref={(el) => {this.image = el}} width="300" height="300"></img>
  render() {
    return (
      <div className="ui inverted active page dimmer" style={{overflow: 'auto'}}>
        <div className="ui container" style={{background: "white"}}>
          <h1 className="ui header">
            Export
            <div className="sub header">{this.props.basename}</div>
          </h1>

          <div className="ui two column grid">
            <div className="column">
              <div className="ui segment">
                <h4 className="ui header">Save map</h4>
                <div className="ui list">
                  <div className="item">
                    <i className="file image outline icon"></i>
                    <div className="content">
                      <a ref={(el) => {this.anchorSvg = el}}></a>
                    </div>
                  </div>
                  <div className="item">
                    <i className="file image outline icon"></i>
                    <div className="content">
                      <a ref={(el) => {this.anchorPng = el}}></a>
                    </div>
                  </div>
                </div>
              </div>
              <div className={`ui segment${this.props.clusters.length === 0? " disabled" : ""}`}>
                <h4 className="ui header">Save bioregions</h4>
                <div className="ui list">
                  <div className="item">
                    <i className="world icon"></i>
                    <div className="content">
                      <a ref={(el) => {this.anchorGeoJSON = el}}></a>
                    </div>
                  </div>
                  <div className="item">
                    <i className="file archive outline icon"></i>
                    <div className="content">
                      <a ref={(el) => {this.anchorShapefile = el}} onClick={this.clickDownloadShapefile}></a>
                    </div>
                  </div>
                </div>
              </div>
              <div className={`ui segment${this.props.clusters.length === 0? " disabled" : ""}`}>
                <h4 className="ui header">Save clusters</h4>
                <div className="ui list">
                  <div className="item">
                    <i className="file text outline icon"></i>
                    <div className="content">
                      <a ref={(el) => {this.anchorClustersCSV = el}}></a>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="column">
              <canvas className="ui fluid image" ref={(el) => {this.canvas = el}} width="500" height="500"></canvas>
            </div>
          </div>



          <div className="ui divider"></div>
          <button className="ui very basic button" tabIndex="0" onClick={this.props.onHide}>Back</button>
        </div>
      </div>
    );
  }
}

export default Export;
