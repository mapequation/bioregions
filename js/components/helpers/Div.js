import React, { PropTypes } from 'react';

export default function Div({children, className, ...style}) {
  return (
    <div className={className} style={style}>{children}</div>
  )
}

Div.propTypes = {
  children: PropTypes.node,
  className: PropTypes.string,
  display: PropTypes.string,
  padding: PropTypes.string,
  paddingTop: PropTypes.string,
  paddingBottom: PropTypes.string,
  paddingLeft: PropTypes.string,
  paddingRight: PropTypes.string,
  margin: PropTypes.string,
  marginTop: PropTypes.string,
  marginBottom: PropTypes.string,
  marginLeft: PropTypes.string,
  marginRight: PropTypes.string,
}
