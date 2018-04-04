import React, {Component, PropTypes} from 'react';
import treeChart from './treeChart.js';
import chroma from 'chroma-js';
import treeUtils from '../../utils/treeUtils';
import TangleInput from '../lib/TangleInput';
import Div from '../helpers/Div';
import geoTreeUtils from '../../utils/phylogeny/geoTreeUtils';

import TreeStyles from './Tree.css';

const BY_ORIGINAL_ORDER = 'by original order';
const BY_MAX_BRANCH_LENGTH_DESC = 'by max branch length (descending)';
const BY_MAX_BRANCH_LENGTH_ASC = 'by max branch length (ascending)';
const BY_BRANCH_SIZE_DESC = 'by branch size (descending)';
const BY_BRANCH_SIZE_ASC = 'by branch size (ascending)';
const BY_OCCURRENCE_COUNT = 'by occurrence count';
const BY_BIOREGIONS = 'by bioregions';

class Tree extends Component {

  static propTypes = {
    // width: PropTypes.number.isRequired,
    // height: PropTypes.number.isRequired,
    // bins: PropTypes.array.isRequired,
    clusterColors: PropTypes.array.isRequired,
    clustersPerSpecies: PropTypes.object.isRequired,
    species: PropTypes.array.isRequired,
    phyloTree: PropTypes.object,
    showClusteredNodes: PropTypes.bool.isRequired,
    setShowClusteredNodes: PropTypes.func.isRequired,
  }
   
  initialState = {
    leafCountLimit: 200,
    filter: "",
    currentSortOption: BY_ORIGINAL_ORDER,
    currentSpeciesCount: 0,
    currentOccurrenceCount: 0,
  }
  
  state = {
    ...this.initialState,
  }

  componentDidMount() {
    this.updateTree();
  }
  
  componentWillReceiveProps(nextProps) {
    const {clusterColors, phyloTree} = this.props;
    const shouldUpdate = clusterColors !== nextProps.clusterColors ||
      phyloTree !== nextProps.phyloTree;
    if (shouldUpdate) {
      this.updateTree(nextProps);
    }
  }

  componentWillUnmount() {
    treeChart.destroy(this.svg);
  }
  
  calculateCurrentAggregate(tree) {
    if (!tree)
      return;
    let currentSpeciesCount = 0;
    let currentOccurrenceCount = 0;
    let numLeafs = 0;
    treeUtils.visitTreeDepthFirst(tree, (node) => {
      if (node.isLeaf) {
        currentSpeciesCount += node.speciesCount;
        currentOccurrenceCount += node.occurrenceCount;
        ++numLeafs;
      }
    });
    this.setState({ currentSpeciesCount, currentOccurrenceCount });
  }
  
  updateTree(newPropsOrState) {
    const state = Object.assign({}, this.props, this.state, newPropsOrState);
    state.phyloTree = this.getFilteredTree(state);
    console.log('RENDER TREE... have tree?', !!state.phyloTree);
    treeChart.render(this.svg, state);
    treeChart.render(this.minimap, Object.assign({}, state, {
      minimap: true,
    }));
    this.calculateCurrentAggregate(state.phyloTree);
  }

  getFilteredTree(state) {
    if (!state.phyloTree)
      return null;
    const comparator = {
      [BY_ORIGINAL_ORDER]: 'originalChildIndex',
      [BY_MAX_BRANCH_LENGTH_ASC]: 'maxLength',
      [BY_MAX_BRANCH_LENGTH_DESC]: '-maxLength',
      [BY_BRANCH_SIZE_ASC]: 'leafCount',
      [BY_BRANCH_SIZE_DESC]: '-leafCount',
      [BY_OCCURRENCE_COUNT]: '-occurrenceCount',
      // [BY_BIOREGIONS]: (a, b) => a.clusters.clusters[0].clusterId - b.clusters.clusters[0].clusterId,
      [BY_BIOREGIONS]: (a, b) => {
        const aclu = a.clusters.clusters;
        const bclu = b.clusters.clusters;
        if (aclu.length === 0 || bclu.length === 0)
          return 0;
        return aclu[0].clusterId - bclu[0].clusterId;
      },
    };
    const comp = comparator[state.currentSortOption];
    console.log(`[Tree]: sort and limit tree...`);
    treeUtils.sort(state.phyloTree, comp);
    return treeUtils.limitLeafCount(state.phyloTree, state.leafCountLimit);
  }

  getSvg() {
    return this.svg;
  }

  getSvgString() {
    return this.svg.outerHTML;
  }
  
  onChangeLeafCountLimit = (leafCountLimit) => {
    this.updateTree({ leafCountLimit });
    this.setState({ leafCountLimit });
  }
  
  handleChangeSort = (event) => {
    event.preventDefault();
    const currentSortOption = event.target.value;
    this.updateTree({ currentSortOption });
    this.setState({ currentSortOption });
  }
  
  renderMapTreeTable() {
    const { species } = this.props;
    // Only render if there are any species distribution
    if (species.length === 0)
      return null;
    const { phyloTree } = this.props;
    const { speciesCount, occurrenceCount } = phyloTree;
    const { currentSpeciesCount, currentOccurrenceCount } = this.state;
    return (
      <table className="ui small celled definition table">
        <thead>
          <tr>
            <th>Map\Tree</th>
            <th>selection</th>
            <th>whole</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>species</td>
            <td>{currentSpeciesCount}</td>
            <td>{speciesCount}</td>
          </tr>
          <tr>
            <td>occurrences</td>
            <td>{currentOccurrenceCount}</td>
            <td>{occurrenceCount}</td>
          </tr>
        </tbody>
      </table>
    )
  }
  
  renderControlPanel() {
    const { phyloTree, showClusteredNodes } = this.props;
    if (!phyloTree)
      return null;
    const { leafCount } = phyloTree;
    const { currentSortOption } = this.state;
    const sortOptions = [BY_ORIGINAL_ORDER, BY_MAX_BRANCH_LENGTH_DESC, BY_MAX_BRANCH_LENGTH_ASC, BY_BRANCH_SIZE_DESC, BY_BRANCH_SIZE_ASC];
    const haveGeoSpecies = phyloTree.occurrenceCount > 0;
    if (haveGeoSpecies) {
      sortOptions.push(BY_OCCURRENCE_COUNT);
    }
    const haveClusters = phyloTree.clusters.clusters.length > 0;
    if (haveClusters) {
      sortOptions.push(BY_BIOREGIONS);
    }
    
    console.log(`[Tree]: haveGeoSpecies: ${haveGeoSpecies}, haveClusters: ${haveClusters}`);
    
    return (
      <div>
        <p>Show max  
          <TangleInput className="ui label"
              value={this.state.leafCountLimit}
              min={1}
              max={leafCount}
              logStep={1}
              speed={0.2}
              onChange={this.onChangeLeafCountLimit} />
        of {leafCount} species</p>
        <select className="ui fluid dropdown" value={currentSortOption} onChange={this.handleChangeSort}>
          {
            sortOptions.map((sort, i) => (
              <option key={i} value={sort}>{sort}</option>
            ))
          }
        </select>
        { this.renderMapTreeTable() }
      </div>
    );
  }
  
  render() {
    const { phyloTree } = this.props;
    console.log("Tree::render()");
    console.log('Colors:', this.props.clusterColors.map(c => c.hex()));

    return (
      <Div className="ui two column stackable grid" display={phyloTree ? 'block' : 'none'}>
        <div className="four wide column">
          <div className="ui segment">
            <h4 className="ui header">Tree</h4>
            <svg id="treeMinimap" ref={(el) => this.minimap = el}>
            </svg>
            { this.renderControlPanel() }
          </div>
        </div>
        <div className="twelve wide column">
          <div className="ui segment main-tree-container">
            <svg id="phylogram" ref={(el) => this.svg = el}>
            </svg>
          </div>
        </div>
      </Div>
    );
  }
}

export default Tree;
