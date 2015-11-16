import React, {Component, PropTypes} from 'react';
import FileLoader from './FileLoader';
import Infomap from './Infomap';
import Binning from './Binning';
import {BY_NAME, BY_CLUSTER} from '../constants/Display';
import {getBioregions} from '../utils/polygons';
import shpWrite from "shp-write"
import R from 'ramda';
import d3 from 'd3';

class ControlPanel extends Component {
  constructor(props) {
    super(props);
  }

  state = {
    save: null,
  }

  componentDidMount() {
    $('.ui.accordion').accordion();
  }

  renderSelectGroupBy() {
    const {data, actions} = this.props;
    if (data.clusterIds.length == 0)
      return (<div></div>);

    let availableGroupings = [BY_NAME, BY_CLUSTER];

    // return (
    //   <div className="field">
    //     <select className="ui dropdown" value={BY_CLUSTER}>
    //       <option value={BY_NAME}>BY_NAME</option>
    //       <option value={BY_CLUSTER}>BY_CLUSTER</option>
    //     </select>
    //   </div>
    // )

    return (
      <div class="field">
        <label>Statistics by</label>
        <div className="ui compact basic buttons">
          {availableGroupings.map((grouping) => (
            <button key={grouping}
              className={`ui button ${grouping == data.groupBy? "active" : ""}`}
              onClick={() => actions.changeGroupBy(grouping)}>{grouping}</button>
          ))}
        </div>
      </div>
    )


    // return (
    //   <div class="field">
    //     <label>Group by</label>
    //     <select className="ui fluid dropdown" value={data.groupBy}>
    //       {availableGroupings.map(grouping => {
    //         console.log(`option: ${grouping}, data.groupBy: ${data.groupBy} => selected: ${grouping == data.groupBy}`);
    //         return (
    //           <option key={grouping} value={grouping}>{grouping}</option>
    //         );
    //       })}
    //     </select>
    //   </div>
    // );
  }

  setSave(url, name) {
    if (this.state.save) {
      URL.revokeObjectURL(this.state.save.url);
    }
  this.setState({save: {url, name}});
  }

  handleClickSaveFile = () => {
    // If revoking directly, the file wouldn't be downloaded
    let self = this;
    setTimeout(() => {
      if (self.state.save) {
        URL.revokeObjectURL(self.state.save.url);
      }
      self.setState({save: null});
    }, 100);
  }

  handleSaveMap = () => {
    let data = $('svg')[0].outerHTML;
    console.log("svg string:", data);
    data = data.replace('<svg', '<svg version="1.1" baseProfile="full" xmlns="http://www.w3.org/2000/svg"');
    // var blob = new Blob([JSON.stringify(data, null, '\t')], {type: 'text/svg'});
    var blob = new Blob([data], {type: 'image/svg+xml'});
    var url = URL.createObjectURL(blob);
    this.setSave(url, "Infomap-bioregions.svg");
  }

  handleSaveBioregionsAsGeoJSON = () => {
    var data = getBioregions();
    var blob = new Blob([JSON.stringify(data, null, '\t')], {type: 'application/vnd.geo+json'});
    var url = URL.createObjectURL(blob);
    this.setSave(url, "Infomap-bioregions.geojson");
  }

  handleSaveBioregionsAsShapefile = () => {
    let geoJson = getBioregions();
    shpWrite.download(geoJson);
  }

  handleSaveClusters = () => {
    const {clusters, clusterColors} = this.props.data;
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
    var blob = new Blob([data], {type: 'text/csv'});
    var url = URL.createObjectURL(blob);
    this.setSave(url, "Infomap-bioregions.csv");
  }



  render() {
    const {files, data, actions} = this.props;
    return (
      <div className="ui styled accordion">
        <div className="active title">
          <i className="dropdown icon"></i>
          Data
        </div>
        <div className="active content">
          <FileLoader {...data} {...files} {...actions} />
          <Binning {...data.binning} {...actions} />
          <Infomap {...data} {...actions} />
        </div>
        <div className="title">
          <i className="dropdown icon"></i>
          Display
        </div>
        <div className="content">
          <div className="ui form">
            {this.renderSelectGroupBy()}
          </div>
          <h4 className="ui dividing header">Export</h4>
          <div className="ui dropdown">
              <div className="text">Save...</div>
              <i className="dropdown icon"></i>
              <div className="menu">
                  <div className="item" data-value="MapSVG" onClick={this.handleSaveMap}>Map as SVG...</div>
                  <div className="item" data-value="GeoJSON" onClick={this.handleSaveBioregionsAsGeoJSON}>Bioregions as GeoJSON...</div>
                  <div className="item" data-value="Shapefile" onClick={this.handleSaveBioregionsAsShapefile}>Bioregions as Shapefile...</div>
                  <div className="item" data-value="Clusters" onClick={this.handleSaveClusters}>Clusters...</div>
              </div>
          </div>
          { this.state.save? <a href={this.state.save.url} onClick={this.handleClickSaveFile} download={this.state.save.url}>{this.state.save.name}</a> : <span></span>}
        </div>
      </div>
    );
  }
}

ControlPanel.propTypes = {
  files: PropTypes.object.isRequired,
  data: PropTypes.object.isRequired,
  actions: PropTypes.object.isRequired,
};

export default ControlPanel;
