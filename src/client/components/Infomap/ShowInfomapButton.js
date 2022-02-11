import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';
import Div from '../helpers/Div';

class ShowInfomapButton extends React.Component {

  static propTypes = {
    bins: PropTypes.array.isRequired,
    isClustering: PropTypes.bool.isRequired,
    showInfomapUI: PropTypes.func.isRequired,
    isShowingInfomapUI: PropTypes.bool.isRequired,
  }

  toggleShowInfomapUI = () => {
    this.props.showInfomapUI(!this.props.isShowingInfomapUI);
  }

  render () {
    const {bins, isClustering} = this.props;
    if (bins.length === 0)
      return (<div></div>);

    const clusterButtonClasses = classNames("ui button", { loading: isClustering });
    return (
      <Div paddingTop="10px">
        <button className={clusterButtonClasses} onClick={this.toggleShowInfomapUI}>Cluster...</button>
      </Div>
    )
  }
}

export default ShowInfomapButton;
