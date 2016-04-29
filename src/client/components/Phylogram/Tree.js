import React, {Component, PropTypes} from 'react';
import treeChart from './treeChart.js';
import chroma from 'chroma-js';

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

  shouldComponentUpdate(nextProps, nextState) {
    const {clustersPerSpecies, clusterColors, phyloTree} = this.props;
    return clusterColors !== nextProps.clusterColors ||
      clustersPerSpecies !== nextProps.clustersPerSpecies ||
      phyloTree !== nextProps.phyloTree;
  }

  getSvg() {
    return this.svg;
  }

  getSvgString() {
    return this.svg.outerHTML;
  }

  componentDidMount() {
    treeChart.render(this.svg, this.props);
  }

  componentDidUpdate() {
    treeChart.render(this.svg, this.props);
  }

  componentWillUnmount() {
    treeChart.destroy(this.svg);
  }

  render() {
    console.log("Tree::render()");

    return (
      <div style={{position: 'relative', overflow: 'auto'}}>
        <svg ref={(el) => this.svg = el}>
        </svg>
      </div>
    );
  }
}

export default Tree;
