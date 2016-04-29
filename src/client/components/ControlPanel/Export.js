import React, {Component, PropTypes} from 'react';
import shpWrite from "shp-write"
import R from 'ramda';
import d3 from 'd3';
import _ from 'lodash';
import Div from '../helpers/Div';
import io from '../../utils/io';
import {clusteredBinsToCollectionOfMultiPolygons, clusteredBinsToCollectionOfPolygons} from '../../utils/polygons';

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
    if (this.props.bins.length === 0)
      return (<span></span>);

    return (
      <Div paddingTop="10px">
        <button className="ui button" onClick={this.showExport}>Export...</button>
        {this.state.showExport? (
          <ExportWindow {...this.props} onHide={this.hideExport}></ExportWindow>
        ) : (<i></i>)}
      </Div>
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

  constructor(props) {
    super(props);
    this.state = {
      files: {
        svg: {
          group: 'map',
          filename: `${props.basename}.svg`,
          icon: 'file image outline icon',
          url: null,
        },
        png: {
          filename: `${props.basename}.png`,
          group: 'map',
          icon: 'file image outline icon',
          url: null,
        },
        geojson: {
          filename: `${props.basename}.geojson`,
          group: 'bioregions',
          icon: 'world icon',
          url: null,
        },
        shapefile: {
          filename: `${props.basename}_shapefile.zip`,
          group: 'bioregions',
          icon: 'file archive outline icon',
          url: null,
        },
        csv: {
          filename: `${props.basename}.csv`,
          group: 'cluster statistics',
          icon: 'file text outline icon',
          url: null,
        },
        treeSvg: {
          filename: `${props.basename}_tree.svg`,
          group: 'tree',
          icon: 'file image outline icon',
          url: null,
        },
      },
    };
  }

  componentDidMount() {
    let { files } = this.state;
    _.forEach(files, file => { file.isLoading = true; });
    this.getSvgUrl()
      .then(svgUrl => {
        files.svg.url = svgUrl;
        files.svg.isLoading = false;
        return this.getPngUrl(svgUrl);
      })
      .then(pngUrl => {
        files.png.url = pngUrl;
        files.png.isLoading = false;
        this.setState({ files });
      })
      .catch(error => {
        console.log("!!! Error getting map files:", error);
        this.setState({ error });
      });

    Promise.all([this.getGeoJSONUrl(), this.getShapefileUrl(), this.getClustersCSVUrl()])
      .then(([geojsonUrl, shapefileUrl, csvUrl]) => {
        files.geojson.url = geojsonUrl;
        files.geojson.isLoading = false;
        files.shapefile.url = shapefileUrl;
        files.shapefile.isLoading = false;
        files.csv.url = csvUrl;
        files.csv.isLoading = false;
        this.setState({ files });
      })
      .catch(error => {
        console.log("!!! Error getting cluster files:", error);
        this.setState({ error });
      });
    
    this.getTreeSvgUrl()
      .then(svgUrl => {
        files.treeSvg.url = svgUrl;
        files.treeSvg.isLoading = false;
        this.setState({ files });
      })
      .catch(error => {
        console.log("!!! Error getting tree svg file:", error);
        this.setState({ error });
      });
  }

  componentWillUnmount() {
    console.log("Unmounting ExportWindow, revoking object urls...");
    _.filter(this.state.files, file => file.url).forEach(file => {
      console.log(`Revoking blob url ${file.url} for ${file.filename}...`);
      URL.revokeObjectURL(file.url);
    });
  }

  getSvgUrl() {
    return this.getSvg('worldmap')
      .then(_.partial(io.dataToBlobURL, 'image/svg+xml'));
  }

  getTreeSvgUrl() {
    return this.getSvg('phylogram')
      .then(_.partial(io.dataToBlobURL, 'image/svg+xml'));
  }

  getPngUrl(svgUrl) {
    if (!svgUrl)
      return Promise.resolve(null);
    return this.getPng(svgUrl)
      .then(_.partial(io.dataToBlobURL, 'image/png'));
  }

  getGeoJSONUrl() {
    if (this.props.clusters.length === 0)
      return Promise.resolve(null);
    return this.getGeoJSON()
      .then(io.prettyStringifyJSON)
      .then(_.partial(io.dataToBlobURL, 'application/vnd.geo+json'));
  }

  getShapefileUrl() {
    if (this.props.clusters.length === 0)
      return Promise.resolve(null);
    return this.getShapefile()
      .then(_.partial(io.dataToBlobURL, 'application/zip'));
  }

  getClustersCSVUrl() {
    if (this.props.clusters.length === 0)
      return Promise.resolve(null);
    return this.getClustersCSV()
      .then(_.partial(io.dataToBlobURL, 'text/csv'));
  }

  getSvg(elementId) {
    return new Promise(resolve => {
      let $svg = $(`svg#${elementId}`);
      if ($svg.length === 0)
        return resolve(null);
      console.log(`svg content: ${$svg}`);
      // let svgContent = $svg[0].outerHTML;
      let svgContent = $svg.parent().html();
      // console.log("svgContent before:", svgContent.substring(0, 250));
      svgContent = svgContent.replace(/^<svg/, ['<svg',
      'xmlns="http://www.w3.org/2000/svg"',
      'xmlns:xlink="http://www.w3.org/1999/xlink"',
      'version="1.1"'].join(' '));
      // Safari inserts NS1/NS2 namespaces as xlink is not defined within the svg html
      svgContent = svgContent.replace("NS1", "xlink");
      svgContent = svgContent.replace("NS2", "xlink");
      // console.log("svgContent after:", svgContent.substring(0, 250));
      resolve(svgContent);
    });
  }

  getPng(svgUrl) {
    return new Promise((resolve, reject) => {
      const $svg = $('svg.worldmap');
      const [width, height] = [$svg.width(), $svg.height()];
      this.canvas.width = width;
      this.canvas.height = height;
      var ctx = this.canvas.getContext('2d');

      var image = new Image(width, height)
      image.onload = () => {
        console.log("Image loaded! Draw to canvas...");
        ctx.drawImage(image, 0, 0);
        resolve(io.dataURLtoData(this.canvas.toDataURL('image/png')));
      }
      image.onerror = (e) => {
        console.log("ERROR setting image src:", e.type, e, e.message);
        reject(e);
      }
      console.log("Set img src to svg url:", svgUrl);
      image.src = svgUrl; // Trigger onload
    });
  }

  getGeoJSON() {
    return Promise.resolve(clusteredBinsToCollectionOfMultiPolygons(this.props.bins));
  }


  getShapefile() {
    const shpOptions = {
      folder: this.props.basename,
      types: {
        polygon: this.props.basename
      }
    };
    return Promise.resolve(clusteredBinsToCollectionOfPolygons(this.props.bins)) // No MultiPolygon
      .then(data => shpWrite.zip(data, shpOptions))
      .then(io.base64toData);
  }

  getClustersCSV() {
    return new Promise(resolve => {
      const {clusters, clusterColors} = this.props;
      if (clusters.length == 0)
        return "";
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
      resolve(csvData);
    });
  }

  render() {
    const { files, error } = this.state;
    const FileGroups = _(files)
      .map()
      .groupBy(({group}) => group)
      .map((files, group) => {
        return (
          <div key={group} className="ui left aligned segment">
            <h4 className="ui center aligned header">Save {group}</h4>
            <div className="ui link list">
              {
                files.map(({filename, icon, url, isLoading}, i) => (
                  <a key={i} href={url} download={filename} target="_blank" className={`item ${url ? "active" : "disabled"}`}>
                    <div className="">
                      <i className="large icons">
                        <i className={icon}></i>
                        <i className={`corner ${isLoading? "notched circle loading" : "download"} icon`}></i>
                      </i>
                      {filename}
                    </div>
                  </a>
                ))
              }
            </div>
          </div>
        );
      })
      .value();

    const ErrorMessage = error ? (
      <div className="ui left aligned very basic segment">
        <div className="ui negative icon message">
          <i className="warning icon"></i>
          <div className="content">
            <div className="header">
              {error.name}
            </div>
            <p>{`${error.message}. Please report the issue.`}</p>
          </div>
        </div>
      </div>
    ) : (<span></span>)

    return (
      <div className="ui inverted active page dimmer" style={{overflow: 'auto'}}>
        <div className="ui container" style={{background: "white"}}>
          <h1 className="ui header">
            Export
            <div className="sub header">{this.props.basename}</div>
          </h1>

          { ErrorMessage }

          <div className="ui two column grid">
            <div className="column">
              { FileGroups }
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
