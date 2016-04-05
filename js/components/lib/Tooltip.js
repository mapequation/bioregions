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
    const node = this.props.children[0];
    const tooltipNodes = this.state.showTooltip? Children.toArray(this.props.children.slice(1)) : "";
    return (
      <span className="tooltip-parent" onMouseOver={this.handleMouseOver} onMouseOut={this.handleMouseOut}>
        {node}
          <span className="tooltip">
            {tooltipNodes}
          </span>
      </span>
    );
  }
}

export default Tooltip;
