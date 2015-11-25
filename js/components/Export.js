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
    // let svgContent = $svg[0].outerHTML;
    let svgContent = $svg.parent().html();
    console.log("svgContent before:", svgContent.substring(0, 250));
    svgContent = svgContent.replace(/^<svg/, ['<svg',
      'xmlns="http://www.w3.org/2000/svg"',
      'xmlns:xlink="http://www.w3.org/1999/xlink"',
      'version="1.1"'].join(' '));
    // Safari inserts NS1/NS2 namespaces as xlink is not defined within the svg html
    svgContent = svgContent.replace("NS1", "xlink");
    svgContent = svgContent.replace("NS2", "xlink");
    console.log("svgContent after:", svgContent.substring(0, 250));

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
    image.onerror = (e) => {
      console.log("ERROR setting image src:", e.type, e, e.message);
      this.generateLinks();
    }
    console.log("Set img src to svg...");
    image.src = this.svgURL;
    console.log("src set, complete:", image.complete);

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
    shpWrite.download(geoJSON, {
      folder: this.props.basename,
      types: {
        polygon: this.props.basename
      }
    }); // -> location.href = 'data:application/zip;base64,' + content;
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
                <h4 className="ui header">Save cluster statistics</h4>
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
