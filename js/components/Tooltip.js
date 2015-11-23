import React, {Component, PropTypes, Children} from 'react';
import styles from './Tooltip.css';
import classNames from 'classnames';

class Tooltip extends Component {

  static propTypes = {
    children: PropTypes.array.isRequired
  }

  state = {
    showTooltip: false,
  }

  handleMouseOver = () => {
    this.setState({showTooltip: true});
  }

  handleMouseOut = () => {
    this.setState({showTooltip: false});
  }

  render() {
    let node = this.props.children[0];
    let tooltipNodes = this.state.showTooltip? Children.toArray(this.props.children.slice(1)) : "";
    return (
      <span onMouseOver={this.handleMouseOver} onMouseOut={this.handleMouseOut} style={{position: 'relative'}}>
        {node}
          <span className="tooltip">
            {tooltipNodes}
          </span>
      </span>
    );
  }
}

export default Tooltip;
