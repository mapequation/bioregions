import React, {Component, PropTypes} from 'react';
import phylogramChart from './phylogramChart.js';
import chroma from 'chroma-js';

class Phylogram extends Component {

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
    return this.svgParent.getElementsByTagName('svg')[0];
  }

  getSvgString() {
    return this.svgParent.innerHTML;
    // .replace(/^<svg/, svgProps)
    // var svgProps = '<svg version="1.1" baseProfile="full" xmlns="http://www.w3.org/2000/svg">';
    // return svgProps + svg.html() + "</svg>";
  }

  state = {}

  updateDimensions = () => {
    if (!this.svgParent) {
      throw new Error('Cannot find Phylogram container div')
    }
    let { clientWidth, clientHeight } = this.svgParent;
    let nextState = {
      width: clientWidth,
      containerWidth: clientWidth,
      containerHeight: clientHeight
    };
    this.setState(nextState);
  }

  onResize = () => {
    if (this.rqf) return
    this.rqf = window.requestAnimationFrame(() => {
      this.rqf = null
      this.updateDimensions()
    })
  }

  getChartProps() {
    return Object.assign({}, this.props, this.state);
  }

  componentDidMount() {
    this.updateDimensions();
    window.addEventListener('resize', this.onResize, false);
    phylogramChart.create(this.svgParent, this.getChartProps());
  }

  componentDidUpdate() {
    phylogramChart.update(this.svgParent, this.getChartProps());
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this.onResize);
    phylogramChart.destroy(this.svgParent);
  }

  render() {
    // console.log("Phylogram::render()");

    return (
      <div>
        <div ref={(el) => this.svgParent = el}>
        </div>
      </div>
    );
  }
}

export default Phylogram;
