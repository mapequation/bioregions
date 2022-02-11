import PropTypes from 'prop-types';
import React, { Component } from 'react';
import { Checkbox as SemanticCheckbox } from 'semantic-ui-react';

export default class Checkbox extends Component {

  onChange = () => {
    this.props.onChange(!this.props.checked);
  }

  render() {
    const { label, checked } = this.props;
    return (
      <SemanticCheckbox slider label={label} checked={checked} onChange={this.onChange}/>
    );
  }
}

Checkbox.propTypes = {
  checked: PropTypes.bool.isRequired,
  label: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
};
