import React, { PropTypes } from 'react'
import chroma from 'chroma-js'
import { parseTree } from '../utils/phylogeny'
import Phylogram from '../components/Phylogram/Phylogram';

class ExamplePhylogram extends React.Component {

  state = {
    treeString: "((Species A:0.3,Species B:0.4):0.1,(Species C:0.1,Species D:0.2):0.5);",
    clusterColors: [
      chroma('#e17a5c'),
      chroma('#b6abe5'),
    ],
    clustersPerSpecies: {
      'Species A': {
        count: 3,
        clusters: [
          { clusterId: 0, count: 3 },
        ]
      },
      'Species B': {
        count: 3,
        clusters: [
          { clusterId: 0, count: 2 },
          { clusterId: 1, count: 1 },
        ]
      },
      'Species C': {
        count: 3,
        clusters: [
          { clusterId: 1, count: 3 },
        ]
      },
      'Species D': {
        count: 2,
        clusters: [
          { clusterId: 1, count: 2 }
        ]
      },
    },
  }

  componentDidMount() {
    parseTree(this.state.treeString).then(phyloTree => this.setState({ phyloTree }));
  }

  render () {
    console.log("Render ExamplePhylogram...");
    const {treeString, ...treeData} = this.state;
    return (
      <div>
        <pre style={{overflow: 'auto', whiteSpace: 'pre-wrap'}}>{treeString}</pre>
        <p>The example data above may generate this phylogram:</p>
        <Phylogram {...treeData}/>
      </div>
    )
  }
}

export default ExamplePhylogram;
