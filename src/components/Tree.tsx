import React from 'react';
// @ts-ignore
import PhylocanvasGL from '@phylocanvas/phylocanvas.gl';

type TreeProps = {
  source: string;
  size: { width: number; height: number };
  showLabels: boolean;
  showLeafLabels: boolean;
  interactive: boolean;
};

export default class PhylocanvasTree extends React.Component<TreeProps> {
  static displayName = 'Phylocanvas';

  tree: any = null;
  canvasRef = React.createRef<HTMLDivElement>();

  getProps(props = {}) {
    return {
      nodeSize: 4,
      ...this.props,
      ...props,
    };
  }

  componentDidMount() {
    this.tree = new PhylocanvasGL(this.canvasRef.current, this.getProps(), [
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
    this.tree.setProps(this.getProps(props));
  }

  componentWillUnmount() {
    this.tree.destroy();
  }

  render() {
    return <div id="tree-div" ref={this.canvasRef} />;
  }
}
