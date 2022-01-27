import React from 'react';
// @ts-ignore
import PhylocanvasGL from '@phylocanvas/phylocanvas.gl';

type TreeProps = {
  source: string;
  size: { width: number; height: number };
  showLabels: boolean;
  showLeafLabels: boolean;
  interactive: boolean;
  nodeSize?: number;
  fillColour?: string;
  strokeColour?: string;
  fontColour?: string;
};

export default class PhylocanvasTree extends React.Component<TreeProps> {
  static defaultProps = {
    nodeSize: 4,
    fillColour: '#222222',
    strokeColour: '#222222',
    fontColour: '#222222',
  };
  static displayName = 'Phylocanvas';

  tree: any = null;
  canvasRef = React.createRef<HTMLDivElement>();

  componentDidMount() {
    this.tree = new PhylocanvasGL(this.canvasRef.current, this.props, [
      this.fixResolution,
    ]);
  }

  fixResolution = (tree: any) => {
    setTimeout(() => {
      const { canvas } = tree.deck;
      const { width, height } = canvas;
      canvas.width = 2 * width;
      canvas.height = 2 * height;
    }, 1000);
  };

  componentDidUpdate(props: TreeProps) {
    this.tree.setProps(props);
  }

  componentWillUnmount() {
    this.tree.destroy();
  }

  render() {
    return <div id="tree-div" ref={this.canvasRef} />;
  }
}
