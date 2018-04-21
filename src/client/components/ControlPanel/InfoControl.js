import React, { PropTypes } from 'react';
import { Checkbox, Button, Form, Divider, Label, Table } from 'semantic-ui-react';
import ShowInfomapButton from '../Infomap/ShowInfomapButton';
import Tooltip from '../lib/Tooltip';
import Div from '../helpers/Div';
import Colors from './Colors';
import chroma from 'chroma-js';
import { BY_CELL, BY_CLUSTER } from '../../constants/Display';

class InfoControl extends React.Component {
  static propTypes = {
    clusters: PropTypes.array.isRequired,
    bins: PropTypes.array.isRequired,
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
  }

  constructor(props) {
    super(props);

    this.formatArea = d3.format(',.2g');
  }

  toggleShowInfomapUI = () => {
    this.props.showInfomapUI(!this.props.isShowingInfomapUI);
  }

  toggleShowClusters = (event, itemProps) => {
    const { checked } = itemProps;
    const { changeMapBy } = this.props;
    changeMapBy(checked ? BY_CLUSTER : BY_CELL);
  }

  onClickSelectLevel = (event, data) => {
    // Check for toggle
    if (data.active) {
      return;
    }
    const { infoBy } = this.props;
    this.props.changeInfoBy(infoBy === BY_CELL ? BY_CLUSTER : BY_CELL);
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

    return (
      <Checkbox toggle label="Show clusters" checked={mapBy === BY_CLUSTER}
        onChange={this.toggleShowClusters}/>
    );
  }

  renderSelectInfoLevel() {
    const { mapBy, infoBy } = this.props;
    if (mapBy !== BY_CLUSTER) {
      return null;
    }

    return (
      <Form>
        <Form.Field>
          <label>Info level</label>
          <Button.Group compact basic>
            <Button active={infoBy === BY_CELL} onClick={this.onClickSelectLevel}>Cells</Button>
            <Button active={infoBy === BY_CLUSTER} onClick={this.onClickSelectLevel}>Regions</Button>
          </Button.Group>
        </Form.Field>
      </Form>
    );
  }

  renderCellInfo(cell) {
    if (!cell) {
      return null;
    }
    const { selectedCell } = this.props;
    const isSelected = cell === selectedCell;
    const d = cell;
    const clusterInfo = d.clusterId < 0 ? '' : `Bioregion: ${d.clusterId + 1}`;

    const CellLabel = (
      <span>
        { isSelected ? 'Selected' : 'Highlighted' }
        <Label size="mini" style={{
          backgroundColor: d.color,
          color: chroma(d.color).luminance() < 0.5 ? 'white' : 'black',
          border: '1px solid #ccc' }}
        >
          Cell {d.binId}
        </Label>
      </span>
    );

    const renderSpeciesRow = ({ name, count, score }) => ({
      key: name,
      cells: [
        name,
        { key: 'count', content: count, collapsing: true, textAlign: 'right' },
        { key: 'score', content: score.toPrecision(3), collapsing: true, textAlign: 'right' },
      ],
    });

    return (
      <div>
        <div style={{ fontSize: '0.85em' }}>
          <Divider horizontal>{CellLabel}</Divider>
          <div style={{ marginTop: -15 }}>Size: <b>{d.size}x{d.size}˚</b> ({this.formatArea(d.area)} km2). {clusterInfo}</div>
        </div>
        <div>
          <b>{d.count}</b> records of <b>{d.speciesCount}</b> species.
        </div>
        <Table celled striped singleLine compact="very" size="small"
          headerRow={['Top common species', 'Count', 'Ind']}
          renderBodyRow={renderSpeciesRow}
          tableData={d.topCommonSpecies.slice(0, 5)}
        />
        <Table celled striped singleLine compact="very" size="small"
          headerRow={['Top indicative species', 'Count', 'Ind']}
          renderBodyRow={renderSpeciesRow}
          tableData={d.topIndicatorSpecies.slice(0, 5)}
        />
      </div>
    );
  }

  renderHighlightedAndSelected() {
    const { highlightedCell, selectedCell } = this.props;
    if (!highlightedCell && !selectedCell) {
      return null;
    }
    return (
      <div>
        { this.renderCellInfo(selectedCell) }
        { this.renderCellInfo(highlightedCell) }
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
        { this.renderSelectMapBy() }
        { this.renderSelectInfoLevel() }
        { this.renderHighlightedAndSelected() }
      </div>
    );
  }
}

export default InfoControl;
