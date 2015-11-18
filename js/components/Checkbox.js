import React, {Component, PropTypes} from 'react';

class Checkbox extends Component {

  componentDidMount() {
    this.setChecked(this.props.checked);
  }

  setChecked(checked) {
    $(this.checkbox).checkbox(checked? 'set checked' : 'set unchecked');
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.checked !== undefined)
      this.setChecked(nextProps.checked);
  }

  handleClick = () => {
    this.props.onChange(!this.props.checked);
  }

  render() {
    return (
      <div className="ui slider checkbox" ref={(el) => {this.checkbox = el}} onClick={this.handleClick}>
        <input type="checkbox" tabIndex="0" className="hidden"></input>
        <label>{this.props.label}</label>
      </div>
    );
  }
}

Checkbox.propTypes = {
  checked: PropTypes.bool.isRequired,
  label: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
}

export default Checkbox;
