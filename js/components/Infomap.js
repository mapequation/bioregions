import React, {Component, PropTypes} from 'react';
import FileInput from './FileInput'
import classNames from 'classnames';
import {CLUSTERING_PROGRESS} from '../constants/ActionTypes';

class Infomap extends Component {

  constructor(props) {
    super(props);
    this.stdoutLines = [];
  }

  static propTypes = {
    bins: PropTypes.array.isRequired,
    isClustering: PropTypes.bool.isRequired,
    getClusters: PropTypes.func.isRequired,
    progressEmitter: PropTypes.object.isRequired,
  }

  state = {
    stdout: "",
    activity: "",
    infomapArgs: "",
    showConsole: false,
  }

  componentDidMount() {
    const {progressEmitter} = this.props;
    progressEmitter.on(CLUSTERING_PROGRESS, (action) => {
      const {type, activity, mode, amount, meta} = action;
      if (meta.stdout)
        this.stdoutLines.push(meta.stdout);
      this.setState({
        stdout: this.stdoutLines.join('\n'),
        activity,
      });
    });
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.isClustering) {
      this.stdoutLines = [];
      this.setState({stdout: "", showConsole: true});
    }
    else if (nextProps.isClustering === false) {
      this.setState({showConsole: false, activity: ""});
    }
  }

  toggleShowConsole = () => {
    this.setState({showConsole: !this.state.showConsole});
  }

  render() {
    const {bins, isClustering, getClusters} = this.props;
    if (bins.length === 0)
      return <div></div>;
    const {activity, stdout, showConsole, infomapArgs} = this.state;
    const haveConsoleContent = stdout.length > 0;
    let clusterButtonClasses = classNames("ui button", { loading: isClustering });
    let toggleConsoleClasses = classNames("ui basic icon button", {active: haveConsoleContent});
    return (
      <div>
        <span>
          <button className={clusterButtonClasses}
            disabled={isClustering ? "disabled" : false}
            onClick={() => getClusters(infomapArgs)}>
            Cluster...
          </button>
          <button className={toggleConsoleClasses} onClick={this.toggleShowConsole}>
            <i className="terminal icon"></i>
          </button>
        </span>

        {showConsole? (
          <Console header={activity} stdout={stdout}>
          </Console>
        ) : (<span></span>)}

      </div>
    );
    // <i className="bordered terminal icon"></i>
  }
}

const consoleStyles = {
  height: "20%",
  top: "auto !important",
  bottom: 0,
  overflow: 'auto',
  borderTop: "1px solid #ccc",
  paddingTop: "3px",
}

const consoleTextareaStyles = {
  width: "100%",
  height: "100%",
  border: 0,
  resize: "none",
}

class Console extends Component {

  constructor(props) {
    super(props);
    this.shouldScrollBottom = true;
  }

  scrollToBottom() {
    this.textarea.scrollTop = this.textarea.scrollHeight;
  }

  componentDidMount() {
    this.scrollToBottom();
  }

  componentWillUpdate() {
    const {textarea} = this;
    // Should keep scroll to bottom only if already at bottom
    this.shouldScrollBottom = textarea.scrollTop + textarea.offsetHeight === textarea.scrollHeight;
  }

  componentDidUpdate() {
    if (this.shouldScrollBottom) {
      this.scrollToBottom();
    }
  }

  render() {
    const {header, stdout} = this.props;
    return (
      <div className="ui inverted active page dimmer" style={consoleStyles}>
        <div className="ui container" style={{height: "100%"}}>
          <h4 className="ui left aligned header">
            {header}
          </h4>
          <textarea value={stdout} ref={(el) => {this.textarea = el}} readOnly style={consoleTextareaStyles}></textarea>
        </div>
      </div>
    );
  }
}

Console.propTypes = {
  header: PropTypes.string.isRequired,
  stdout: PropTypes.string.isRequired,
}

export default Infomap;
