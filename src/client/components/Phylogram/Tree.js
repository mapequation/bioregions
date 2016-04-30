import React, {Component, PropTypes} from 'react';
import treeChart from './treeChart.js';
import chroma from 'chroma-js';
import treeUtils from '../../utils/treeUtils';
import TangleInput from '../lib/TangleInput';

import TreeStyles from './Tree.scss'

class Tree extends Component {

  static propTypes = {
    // width: PropTypes.number.isRequired,
    // height: PropTypes.number.isRequired,
    // bins: PropTypes.array.isRequired,
    clusterColors: PropTypes.array.isRequired,
    clustersPerSpecies: PropTypes.object.isRequired,
    phyloTree: PropTypes.object,
  }
   
  initialState = {
    leafCountLimit: 100,
    filter: "",
  }
  
  state = {
    ...this.initialState,
  }

  shouldComponentUpdate(nextProps, nextState) {
    const {clustersPerSpecies, clusterColors, phyloTree} = this.props;
    return clusterColors !== nextProps.clusterColors ||
      clustersPerSpecies !== nextProps.clustersPerSpecies ||
      phyloTree !== nextProps.phyloTree;
  }

  componentDidMount() {
    this.updateTree();
  }

  componentDidUpdate() {
    this.updateTree();
  }

  componentWillUnmount() {
    treeChart.destroy(this.svg);
  }
  
  updateTree(leafCountLimit) {
    console.log('Update tree!');
    treeChart.render(this.svg, this.getData(leafCountLimit));
  }
  
  getData(leafCountLimit) {
    const { clusterColors, phyloTree } = this.props;
    if (!leafCountLimit)
      leafCountLimit = this.state.leafCountLimit;
    if (!phyloTree)
      return this.props;
    
    return {
      clusterColors,
      // phyloTree,
      // phyloTree: treeUtils.prune(phyloTree, (node) => {
      //   return node.clusters.totCount > 100;
      phyloTree: treeUtils.limitLeafCount(phyloTree, leafCountLimit),
    };
  }

  getSvg() {
    return this.svg;
  }

  getSvgString() {
    return this.svg.outerHTML;
  }
  
  onChangeLeafCountLimit = (leafCountLimit) => {
    this.setState({ leafCountLimit });
    this.updateTree(leafCountLimit);
  }
  
  renderFilter() {
    const { phyloTree } = this.props;
    if (!phyloTree)
      return null;
    return (
      <div>
        Show max
        <TangleInput className="ui label"
            value={this.state.leafCountLimit}
            min={10}
            max={10000}
            logStep={1}
            speed={0.2}
            onChange={this.onChangeLeafCountLimit} />
        species
      </div>
    )
  }

  render() {
    console.log("Tree::render()");

    return (
      <div>
        { this.renderFilter() }
        <div style={{position: 'relative', overflow: 'auto'}}>
          <svg id="phylogram" ref={(el) => this.svg = el}>
          </svg>
        </div>
      </div>
    );
  }
}

export default Tree;
