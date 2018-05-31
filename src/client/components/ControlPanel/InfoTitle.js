import React, {PropTypes} from 'react';
import { observer } from 'mobx-react';
import { Label } from 'semantic-ui-react';

const InfoTitle = ({ active, highlightStore }) =>
  !active && highlightStore.highlightedCell ? (
  <span>Info <Label color="blue" size="mini" circular>i</Label></span>
) : <span>Info</span>;

InfoTitle.propTypes = {
  active: PropTypes.bool.isRequired,
  highlightStore: PropTypes.object.isRequired,
};

export default observer(InfoTitle);
