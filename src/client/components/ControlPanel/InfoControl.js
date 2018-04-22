import React, { PropTypes } from 'react';
import { Checkbox, Button, Form, Divider, Label, Table, Message } from 'semantic-ui-react';
import ShowInfomapButton from '../Infomap/ShowInfomapButton';
import Tooltip from '../lib/Tooltip';
import Div from '../helpers/Div';
import Colors from './Colors';
import chroma from 'chroma-js';
import { BY_CELL, BY_CLUSTER } from '../../constants/Display';
import './InfoControl.css';

class InfoControl extends React.Component {
  static propTypes = {
    clusters: PropTypes.array.isRequired,
    bins: PropTypes.array.isRequired,
    clusterColors: PropTypes.array.isRequired,
    setClusterColors: PropTypes.func.isRequired,
    mapBy: PropTypes.oneOf([BY_CELL, BY_CLUSTER]).isRequired,
    infoBy: PropTypes.oneOf([BY_CELL, BY_CLUSTER]).isRequired,
    changeMapBy: PropTypes.func.isRequired,
    changeInfoBy: PropTypes.func.isRequired,
    isClustering: PropTypes.bool.isRequired,
    showInfomapUI: PropTypes.func.isRequired,
    isShowingInfomapUI: PropTypes.bool.isRequired,
    highlightedCell: PropTypes.object,
    selectedCell: PropTypes.object,
    selectedClusterId: PropTypes.number.isRequired,
  }

  constructor(props) {
    super(props);

    this.formatArea = d3.format(',.2g');
    this.formatIndicativeScore = d3.format(',.3g');
  }

  toggleShowInfomapUI = () => {
    this.props.showInfomapUI(!this.props.isShowingInfomapUI);
  }

  toggleShowClusters = (event, itemProps) => {
    const { checked } = itemProps;
    const { changeMapBy } = this.props;
    changeMapBy(checked ? BY_CLUSTER : BY_CELL);
  }

  onClickSelectMapLevel = (event, data) => {
    // Check for toggle
    if (data.active) {
      return;
    }
    const { mapBy } = this.props;
    this.props.changeMapBy(mapBy === BY_CELL ? BY_CLUSTER : BY_CELL);
  }

  onClickSelectInfoLevel = (event, data) => {
    // Check for toggle
    if (data.active) {
      return;
    }
    const { infoBy } = this.props;
    this.props.changeInfoBy(infoBy === BY_CELL ? BY_CLUSTER : BY_CELL);
  }

  renderLevelControls() {
    const { clusters, isClustering, mapBy, infoBy } = this.props;
    if (clusters.length === 0) {
      return (
        <Button onClick={this.toggleShowInfomapUI}
          disabled={isClustering} loading={isClustering}>
          Cluster...
        </Button>
      );
    }
    return (
      <Table basic='very' compact='very' collapsing unstackable>
        <Table.Body>
          <Table.Row>
            <Table.Cell>Colors by</Table.Cell>
            <Table.Cell>
              <Button.Group compact basic size="mini">
                <Button active={mapBy === BY_CELL} onClick={this.onClickSelectMapLevel}>Cells</Button>
                <Button active={mapBy === BY_CLUSTER} onClick={this.onClickSelectMapLevel}>Regions</Button>
              </Button.Group>
            </Table.Cell>
          </Table.Row>
          <Table.Row>
            <Table.Cell>Statistics by</Table.Cell>
            <Table.Cell>
              <Button.Group compact basic size="mini">
                <Button active={infoBy === BY_CELL} onClick={this.onClickSelectInfoLevel}>Cells</Button>
                <Button active={infoBy === BY_CLUSTER} onClick={this.onClickSelectInfoLevel}>Regions</Button>
              </Button.Group>
            </Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>
    );
  }

  renderSelectMapBy() {
    const { clusters, isClustering, mapBy } = this.props;
    if (clusters.length === 0) {
      return (
        <Button onClick={this.toggleShowInfomapUI}
          disabled={isClustering} loading={isClustering}>
          Cluster...
        </Button>
      );
    }

    // return (
    //   <Checkbox toggle label="Show clusters" checked={mapBy === BY_CLUSTER}
    //     onChange={this.toggleShowClusters}/>
    // );
    return (
      <Form>
        <Form.Field inline>
          <label>Colors by</label>
          <Button.Group compact basic size="mini">
            <Button active={mapBy === BY_CELL} onClick={this.onClickSelectMapLevel}>Cells</Button>
            <Button active={mapBy === BY_CLUSTER} onClick={this.onClickSelectMapLevel}>Regions</Button>
          </Button.Group>
        </Form.Field>
      </Form>
    );
  }

  renderSelectInfoLevel() {
    const { mapBy, infoBy } = this.props;
    if (mapBy !== BY_CLUSTER) {
      return null;
    }

    return (
      <Form>
        <Form.Field inline>
          <label>Statistics by</label>
          <Button.Group compact basic size="mini">
            <Button active={infoBy === BY_CELL} onClick={this.onClickSelectInfoLevel}>Cells</Button>
            <Button active={infoBy === BY_CLUSTER} onClick={this.onClickSelectInfoLevel}>Regions</Button>
          </Button.Group>
        </Form.Field>
      </Form>
    );
  }

  renderInfoTable(cellOrCluster) {
    const d = cellOrCluster;

    const renderSpeciesRow = ({ name, count, score }) => ({
      key: name,
      cells: [
        { key: 'name', content: <span title={name}>{name}</span>, className: 'infoTableCell infoTableNameCell' },
        { key: 'count', content: count, className: 'infoTableCell', textAlign: 'right' },
        { key: 'score', content: this.formatIndicativeScore(score),  className: 'infoTableCell', textAlign: 'right' },
      ],
    });
    
    return (
      <div>
        <Table unstackable celled striped compact="very" size="small"
          headerRow={[
            { key: 'name', content: 'Top common species', className: 'infoTableHeader' },
            { key: 'count', content: 'Count', className: 'infoTableHeader', textAlign: 'right' },
            { key: 'score', content: 'Score', className: 'infoTableHeader', textAlign: 'right' },
          ]}
          renderBodyRow={renderSpeciesRow}
          tableData={d.topCommonSpecies.slice(0, 5)}
          />
        <Table unstackable celled striped compact="very" size="small"
          headerRow={[
            { key: 'name', content: 'Top indicative species', className: 'infoTableHeader' },
            { key: 'count', content: 'Count', className: 'infoTableHeader', textAlign: 'right' },
            { key: 'score', content: 'Score', className: 'infoTableHeader', textAlign: 'right' },
          ]}
          renderBodyRow={renderSpeciesRow}
          tableData={d.topIndicatorSpecies.slice(0, 5)}
          />
      </div>
    );
  }

  renderBioregionInfo(cluster) {
    if (!cluster) {
      return null;
    }
    const { selectedClusterId, clusterColors } = this.props;
    const d = cluster;
    const isSelected = d.clusterId === selectedClusterId;
    const clusterColor = clusterColors[d.clusterId];
    
    const ClusterLabel = d.clusterId < 0 ? null : (
      <Label size="mini" style={{
        backgroundColor: clusterColor.hex(),
        color: clusterColor.luminance() < 0.5 ? 'white' : 'black',
        border: '1px solid #ccc' }}
      >
        Bioregion {d.clusterId + 1}
      </Label>
    );

    const CellLabelDivider = (
      <span>
        { isSelected ? 'Selected' : 'Highlighted' }
      </span>
    );
    
    return (
      <div>
        <div style={{ fontSize: '0.85em' }}>
          <Divider horizontal>{CellLabelDivider}</Divider>
          <div style={{ marginTop: -10 }}>
            { ClusterLabel }
            <b>{d.numBins}</b> cells ({this.formatArea(d.area || 0.0)} km2).
          </div>
        </div>
        <div>
          <b>{d.numRecords}</b> records of <b>{d.numSpecies}</b> species
        </div>
        { this.renderInfoTable(d) }
      </div>
    );
  }

  renderCellInfo(cell) {
    if (!cell) {
      return null;
    }
    const { selectedCell } = this.props;
    const isSelected = cell === selectedCell;
    const d = cell;
    const clusterColor = d.clusterId < 0 ? null : this.props.clusterColors[d.clusterId];
    
    const ClusterLabel = d.clusterId < 0 ? null : (
      <Label size="mini" style={{
        backgroundColor: clusterColor,
        color: chroma(clusterColor).luminance() < 0.5 ? 'white' : 'black',
        border: '1px solid #ccc' }}
      >
        Bioregion {d.clusterId + 1}
      </Label>
    );

    const CellLabel = (
      <Label size="mini" style={{
        backgroundColor: d.color,
        color: chroma(d.color).luminance() < 0.5 ? 'white' : 'black',
        border: '1px solid #ccc' }}
      >
        Cell {d.binId}
      </Label>
    );

    const CellLabelDivider = (
      <span>
        { isSelected ? 'Selected' : 'Highlighted' }
        {/* { CellLabel } */}
      </span>
    );
    //TODO: Rename count and speciesCount to numRecords and numSpecies for consistensy with cluster
    return (
      <div>
        <div style={{ fontSize: '0.85em' }}>
          <Divider horizontal>{CellLabelDivider}</Divider>
          <div style={{ marginTop: -10 }}>
            { CellLabel }
            Size: <b>{d.size}x{d.size}˚</b> ({this.formatArea(d.area)} km2). { ClusterLabel }
          </div>
        </div>
        <div>
          <b>{d.count}</b> records of <b>{d.speciesCount}</b> species
        </div>
        { this.renderInfoTable(d) }
      </div>
    );
  }

  renderHighlightedAndSelected() {
    const { highlightedCell, selectedCell, infoBy, selectedClusterId, clusters } = this.props;
    const selectedCluster = selectedClusterId === -1 ? null : clusters[selectedClusterId].values;
    const target = infoBy === BY_CLUSTER ? 'bioregions' : 'grid cells';
    const haveContent = highlightedCell || selectedCell || selectedCluster;
    if (!haveContent) {
      return (
        <div style={{ paddingTop: '1.5em' }}>
          <Message info compact size="small" style={{ padding: 0 }}
            // icon="info"
            // header="Nothing highlighted or selected"
            content={`Mouse over or click the ${target} to see statistics`}
          />
        </div>
      );
    }
    if (infoBy === BY_CLUSTER) {
      const highlightedCluster = highlightedCell ? clusters[highlightedCell.clusterId].values : null;
      return (
        <div>
          { this.renderBioregionInfo(selectedCluster) }
          { highlightedCluster === selectedCluster ? null : this.renderBioregionInfo(highlightedCluster) }
        </div>
      );
    }
    return (
      <div>
        { this.renderCellInfo(selectedCell) }
        { highlightedCell === selectedCell ? null : this.renderCellInfo(highlightedCell) }
      </div>
    );
  }

  render() {
    const { bins } = this.props;
    if (bins.length === 0) {
      return (
        <div>Please load your data...</div>
      );
    }
    return (
      <div>
        { this.renderLevelControls() }
        { this.renderHighlightedAndSelected() }
      </div>
    );
    // { this.renderSelectMapBy() }
    // { this.renderSelectInfoLevel() }
  }
}

export default InfoControl;
