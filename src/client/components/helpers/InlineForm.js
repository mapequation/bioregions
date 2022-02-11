import PropTypes from 'prop-types';
import React from 'react';

var InlineForm = ({label, children}) => (
  <div className="ui form">
    <div className="inline fields">
      <label>{label}</label>
      <div className="field">
        {children}
      </div>
    </div>
  </div>
);

InlineForm.propTypes = {
  label: PropTypes.string.isRequired,
  children: PropTypes.element.isRequired,
}

export default InlineForm;
