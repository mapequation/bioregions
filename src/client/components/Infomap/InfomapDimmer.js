import PropTypes from "prop-types";
import React, { Component } from "react";
import classNames from "classnames";
import { Form, Radio } from "semantic-ui-react";
import TangleInput from "../lib/TangleInput";
import Checkbox from "../helpers/Checkbox";
import Tooltip from "../lib/Tooltip";
import { CLUSTERING_PROGRESS } from "../../constants/ActionTypes";

class InfomapDimmer extends Component {
  static propTypes = {
    bins: PropTypes.array.isRequired,
    features: PropTypes.array.isRequired,
    species: PropTypes.array.isRequired,
    clusters: PropTypes.array.isRequired,
    isClustering: PropTypes.bool.isRequired,
    getClusters: PropTypes.func.isRequired,
    showInfomapUI: PropTypes.func.isRequired,
    isShowingInfomapUI: PropTypes.bool.isRequired,
    progressEmitter: PropTypes.object.isRequired,
    setInfomapNumTrials: PropTypes.func.isRequired,
    setInfomapMarkovTime: PropTypes.func.isRequired,
    infomap: PropTypes.shape({
      numTrials: PropTypes.number.isRequired,
      markovTime: PropTypes.number.isRequired,
    }).isRequired,
  };

  constructor(props) {
    super(props);
    this.stdoutLines = [];
    this.shouldScrollBottom = true;
  }

  state = {
    stdout: "",
    activity: "",
    //infomapArgs: {},
  };

  componentDidMount() {
    const { progressEmitter } = this.props;
    progressEmitter.on(CLUSTERING_PROGRESS, (action) => {
      const { type, activity, mode, amount, meta } = action;
      if (meta.stdout) this.stdoutLines.push(meta.stdout);
      this.setState({
        stdout: this.stdoutLines.join("\n"),
        activity,
      });
    });

    this.scrollToBottom();
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.isClustering) {
      this.stdoutLines = [];
      this.setState({ stdout: "" });
    } else if (
      nextProps.isClustering === false &&
      this.props.isShowingInfomapUI
    ) {
      // this.props.showInfomapUI(false);
    }
  }

  componentWillUpdate() {
    const { textarea } = this;
    if (!textarea) return;
    // Should keep scroll to bottom only if already at bottom
    this.shouldScrollBottom =
      textarea.scrollTop + textarea.offsetHeight === textarea.scrollHeight;
  }

  componentDidUpdate() {
    if (this.shouldScrollBottom) {
      this.scrollToBottom();
    }
  }

  scrollToBottom() {
    const { textarea } = this;
    if (!textarea) return;
    textarea.scrollTop = textarea.scrollHeight;
  }

  getInfomapArgs() {
    const {
      infomap: { numTrials, markovTime },
    } = this.props;
    const args = { verbose: 1 };
    if (numTrials !== 1) args.numTrials = numTrials;
    if (markovTime !== 1) args.markovTime = markovTime;
    return args;
  }

  handleChangeNumTrials = (value) => {
    this.props.setInfomapNumTrials(Math.round(value));
  };

  handleChangeMarkovTime = (value) => {
    this.props.setInfomapMarkovTime(Math.round(value * 100) / 100);
  };

  handleChangeWeightOnAbundance = () => {
    this.props.setWeightOnAbundance(!this.props.weightOnAbundance);
  };

  handleClickCluster = () => {
    this.props.getClusters(this.getInfomapArgs());
  };

  handleClickBack = () => {
    this.props.showInfomapUI(false);
  };

  render() {
    const {
      isShowingInfomapUI,
      clusters,
      isClustering,
      showInfomapUI,
      infomap,
      phyloTree,
    } = this.props;
    const {
      bins,
      features,
      species,
      phyloregions,
      treeWeightModels,
      treeWeightModelIndex,
    } = this.props;
    const { stdout, activity } = this.state;

    if (!isShowingInfomapUI) return <span></span>;

    const ErrorMessage = <span></span>;
    const clusterButtonClasses = classNames("ui red button", {
      loading: isClustering,
    });
    const textareaStyle = {
      width: "100%",
      height: "300px",
      border: "1px solid #ccc",
      resize: "none",
      marginTop: "10px",
    };

    const InfomapResult =
      clusters.length === 0 ? (
        ""
      ) : (
        <span>
          Partitioned grid cells into{" "}
          <span className="ui basic red label">{clusters.length}</span>{" "}
          clusters, or <em>bioregions</em>.
        </span>
      );

    const onTogglePhyloregions = (e, { checked }) => {
      this.props.useTreeForClustering(checked);
    };

    const handleChangeTreeWeightModel = (e, { value }) => {
      this.props.setTreeWeightModel(value);
    };

    const TreeClusterOptions =
      phyloTree && phyloTree.maxLength ? (
        <div style={{ marginTop: 10 }}>
          {phyloregions.useTree ? (
            <div style={{ display: "flex", alignItems: "center" }}>
              <span style={{ marginRight: 5 }}>Use phylogenetic data</span>
              <Radio
                toggle
                checked={phyloregions.useTree}
                onChange={onTogglePhyloregions}
              />
            </div>
          ) : null}
          {!phyloregions.useTree ? null : (
            <Form style={{ marginTop: 10 }}>
              <h4>Weight model:</h4>
              {treeWeightModels.map((model, index) => (
                <Form.Field key={index}>
                  <Radio
                    label={model.name}
                    name="treeWeightRadioGroup"
                    value={index}
                    checked={treeWeightModelIndex === index}
                    onChange={handleChangeTreeWeightModel}
                  />
                </Form.Field>
              ))}
            </Form>
          )}
        </div>
      ) : null;

    return (
      <div
        className="ui inverted active page dimmer"
        style={{ overflow: "auto" }}
      >
        <div className="ui container" style={{ background: "white" }}>
          <h1 className="ui header">
            Clustering
            <div className="sub header">{activity}</div>
          </h1>

          {ErrorMessage}

          <div className="ui left aligned yellow segment">
            <h4 className="ui header">Input</h4>A bipartite network of{" "}
            <span className="ui basic yellow label">{species.length}</span>{" "}
            species mapped to{" "}
            <span className="ui basic yellow label">{bins.length}</span> grid
            cells.
            {TreeClusterOptions}
          </div>

          <div className="ui left aligned orange segment">
            <h4 className="ui header">
              Options
              <span className="">
                <Tooltip>
                  <i className="help icon" style={{ color: "#ccc" }}></i>
                  <div className="ui floating segment">
                    <table
                      className="ui very basic celled table"
                      style={{
                        backgroundColor: "white",
                        width: "400px",
                        fontWeight: 300,
                      }}
                    >
                      <thead>
                        <tr>
                          <th colSpan={2}>
                            Options to the Infomap clustering algorithm
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>
                            <strong>Number of trials</strong>
                          </td>
                          <td>
                            The number of runs of the clustering algorithm to
                            find the best solution. (Default 1)
                          </td>
                        </tr>
                        <tr>
                          <td>
                            <strong>Number of cluster cost</strong>
                          </td>
                          <td>
                            Tune the clustering algorithm to search for less
                            (increase cost) or more (decrease cost) number of
                            clusters. (Default 1.0)
                          </td>
                        </tr>
                        <tr>
                          <td>
                            <strong>Weight on abundance</strong>
                          </td>
                          <td>
                            Weight links on the number of occurrences of a
                            species in each grid cell to highlight patterns of
                            abundant species. (Default false)
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </Tooltip>
              </span>
            </h4>
            <table className="ui basic collapsing table">
              <tbody>
                <tr>
                  <td className="">Number of trials</td>
                  <td className="">
                    <TangleInput
                      className="ui orange label"
                      value={infomap.numTrials}
                      min={1}
                      max={10}
                      speed={0.1}
                      onChange={this.handleChangeNumTrials}
                    />
                  </td>
                </tr>

                <tr>
                  <td className="">Number of cluster cost</td>
                  <td className="">
                    <TangleInput
                      className="ui orange label"
                      value={infomap.markovTime}
                      min={0.1}
                      max={10}
                      step={0.01}
                      speed={0.5}
                      onChange={this.handleChangeMarkovTime}
                    />
                  </td>
                </tr>

                <tr>
                  <td className="">Weight on abundance</td>
                  <td className="">
                    <Checkbox
                      label=""
                      checked={this.props.weightOnAbundance}
                      onChange={this.handleChangeWeightOnAbundance}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="ui left aligned red segment">
            <h4 className="ui header">Output</h4>
            <button
              className={clusterButtonClasses}
              disabled={isClustering ? "disabled" : false}
              onClick={this.handleClickCluster}
            >
              Run...
            </button>
            {InfomapResult}

            <textarea
              value={stdout}
              ref={(el) => {
                this.textarea = el;
              }}
              readOnly
              style={textareaStyle}
            ></textarea>
          </div>

          <div className="ui divider"></div>
          <button
            className="ui very basic button"
            tabIndex="0"
            onClick={this.handleClickBack}
          >
            Back
          </button>
        </div>
      </div>
    );
  }
}

export default InfomapDimmer;
