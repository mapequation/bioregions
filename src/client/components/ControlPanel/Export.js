import React, {Component, PropTypes} from 'react';
import shpWrite from "shp-write"
import R from 'ramda';
import d3 from 'd3';
import _ from 'lodash';
import Div from '../helpers/Div';
import io from '../../utils/io';
import * as statistics from '../../utils/statistics';
import {clusteredBinsToCollectionOfMultiPolygons, clusteredBinsToCollectionOfPolygons} from '../../utils/polygons';

class Export extends Component {

  static propTypes = {
    bins: PropTypes.array.isRequired,
    species: PropTypes.array.isRequired,
    clusters: PropTypes.array.isRequired,
    clustersPerSpecies: PropTypes.object.isRequired,
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
          filename: `${props.basename}_map.svg`,
          icon: 'file image outline icon',
          url: null,
        },
        png: {
          filename: `${props.basename}_map.png`,
          group: 'map',
          icon: 'file image outline icon',
          url: null,
        },
        geojson: {
          filename: `${props.basename}_bioregions.geojson`,
          group: 'bioregions',
          icon: 'world icon',
          url: null,
        },
        shapefile: {
          filename: `${props.basename}_bioregions_shapefile.zip`,
          group: 'bioregions',
          icon: 'file archive outline icon',
          url: null,
        },
        presenceAbsence: {
          filename: `${props.basename}_presence-absence.txt`,
          group: 'bioregions',
          icon: 'file text outline icon',
          url: null,
        },
        bioregionsCoords: {
          filename: `${props.basename}_bioregions-coords.txt`,
          description: 'Center coordinates for each bioregion',
          group: 'bioregions',
          icon: 'file text outline icon',
          url: null,
        },
        tables: {
          filename: `${props.basename}_summary.csv`,
          description: 'Summary statistics for each bioregion',
          group: 'tables',
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
        files.tables.url = csvUrl;
        files.tables.isLoading = false;
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
    
    this.getPresenceAbsenceUrl()
      .then(url => {
        files.presenceAbsence.url = url;
        files.presenceAbsence.isLoading = false;
        this.setState({ files });
      })
      .catch(error => {
        console.log("!!! Error getting presence-absence file:", error);
        this.setState({ error });
      });
    
    this.getBioregionsCoordsUrl()
      .then(url => {
        files.bioregionsCoords.url = url;
        files.bioregionsCoords.isLoading = false;
        this.setState({ files });
      })
      .catch(error => {
        console.log("!!! Error getting bioregions coords file:", error);
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
  
  getPresenceAbsenceUrl() {
    if (this.props.clusters.length === 0)
      return Promise.resolve(null);
    return this.getPresenceAbsence()
      .then(_.partial(io.dataToBlobURL, 'text/plain'));
  }
  
  getBioregionsCoordsUrl() {
    if (this.props.clusters.length === 0)
      return Promise.resolve(null);
    return this.getBioregionsCoords()
      .then(_.partial(io.dataToBlobURL, 'text/plain'));
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

      const csvData = d3.csv.format(rows);
      resolve(csvData);
    });
  }
  
  getPresenceAbsence() {
    return new Promise(resolve => {    
      const { species, clusters, clustersPerSpecies } = this.props;
      const lines = _.map(clustersPerSpecies, (clu, species) => {
        const presenceAbsence = new Array(clusters.length).fill('0');
        statistics.forEachLimited('rest', clu.clusters, d => {
          presenceAbsence[d.clusterId] = '1';
        });
        return `${species} ${presenceAbsence.join('')}`;
      });
      lines.unshift(`${lines.length} ${clusters.length}`);
      resolve(lines.join('\n'));
    })
  }
  
  getBioregionsCoords() {
    return new Promise(resolve => {    
      const { clusters, bins } = this.props;
      const geoStats = _.range(clusters.length).map(() => {
        return {lat: 0, long: 0, count: 0};
      });
      _.each(bins, bin => {
        // bin: {x1, x2, y1, y2, isLeaf, area, size, count, speciesCount, clusterId}
        const stats = geoStats[bin.clusterId];
        stats.lat += (bin.y1 + bin.y2) / 2;
        stats.long += (bin.x1 + bin.x2) / 2;
        stats.count += 1;
        console.log(`!!! stats[${bin.clusterId}] -> count: ${stats.count}`);
      });
      const centerCoords = geoStats.map(stats => {
        return `${stats.lat / stats.count} ${stats.long / stats.count}`;
      });
      centerCoords.unshift(`# 0 0`);
      resolve(centerCoords.join('\n'));
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
