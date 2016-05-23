import React, {Component, PropTypes, Children} from 'react';
import styles from './Tooltip.css';
import classNames from 'classnames';

class Tooltip extends Component {

  static propTypes = {
    children: PropTypes.array.isRequired,
    style: PropTypes.object,
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
    const {children, style} = this.props;
    const node = children[0];
    const {showTooltip} = this.state;
    const tooltipNodes = showTooltip ? Children.toArray(children.slice(1)) : null;
    return (
      <span className="tooltip-parent" onMouseOver={this.handleMouseOver} onMouseOut={this.handleMouseOut}>
        {node}
          <span className="tooltip" style={style}>
            {tooltipNodes}
          </span>
      </span>
    );
  }
}

export default Tooltip;
