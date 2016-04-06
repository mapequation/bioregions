import React, {Component, PropTypes} from 'react';
import phylogramChart from './phylogramChart.js';

class Phylogram extends Component {

  static propTypes = {
    // width: PropTypes.number.isRequired,
    // height: PropTypes.number.isRequired,
    // bins: PropTypes.array.isRequired,
    clusterColors: PropTypes.array.isRequired,
    clustersPerSpecies: PropTypes.object.isRequired,
    phyloTree: PropTypes.object,
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


  componentDidMount() {
    this.updateDimensions();
    window.addEventListener('resize', this.onResize, false);
    let props = Object.assign({}, this.props, this.state);
    phylogramChart.create(this.svgParent, props);
  }

  componentDidUpdate() {
    let props = Object.assign({}, this.props, this.state);
    phylogramChart.update(this.svgParent, props);
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this.onResize);
    phylogramChart.destroy(this.svgParent);
  }

  render() {
    console.log("Phylogram::render()");

    return (
      <div>
        <div ref={(el) => this.svgParent = el}>
        </div>
      </div>
    );
  }
}

export default Phylogram;
