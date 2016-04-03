import React, { PropTypes } from 'react'
import classNames from 'classnames';

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
      <button className={clusterButtonClasses} onClick={this.toggleShowInfomapUI}>Cluster...</button>
    )
  }
}

export default ShowInfomapButton;
