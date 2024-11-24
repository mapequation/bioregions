import React, { useEffect, useRef } from 'react';
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
  styleNodeEdges?: boolean;
  styles?: { [key: string]: { fillColour: string; shape?: any } };
};

// type PhylocanvasGLType = {
//   destroy: () => void;
//   setProps: (_: TreeProps) => void;
// }
type PhylocanvasGLType = typeof PhylocanvasGL;

export default function PhylocanvasTree(props: TreeProps) {
  const canvasRef = useRef(null); // Equivalent to React.createRef()
  const treeRef = useRef<PhylocanvasGLType>(null); // To store the Phylocanvas instance

  // Lifecycle management with useEffect
  useEffect(() => {
    // Initialize Phylocanvas on mount
    treeRef.current = new PhylocanvasGL(canvasRef.current, props || {});

    return () => {
      // Cleanup on unmount
      if (treeRef.current) {
        treeRef.current.destroy();
      }
    };
  }, []); // Empty dependency array ensures this runs only once (on mount/unmount)

  useEffect(() => {
    // Update tree props when component updates
    if (treeRef.current) {
      treeRef.current.setProps(props);
    }
  }, [props]); // Runs whenever props change

  return <div id="tree-div" ref={canvasRef} />;
}

// export class PhylocanvasTreeClass extends React.Component<TreeProps> {
//   static defaultProps = {
//     nodeSize: 4,
//     fillColour: '#222222',
//     strokeColour: '#222222',
//     fontColour: '#222222',
//   };
//   static displayName = 'Phylocanvas';

//   tree: any = null;
//   canvasRef = React.createRef<HTMLDivElement>();

//   componentDidMount() {
//     this.tree = new PhylocanvasGL(this.canvasRef.current, this.props, [
//       this.fixResolution,
//     ]);
//   }

//   fixResolution = (tree: any) => {
//     setTimeout(() => {
//       const { canvas } = tree.deck;
//       const { width, height } = canvas;
//       canvas.width = 2 * width;
//       canvas.height = 2 * height;
//     }, 1000);
//   };

//   componentDidUpdate(props: TreeProps) {
//     this.tree.setProps(props);
//   }

//   componentWillUnmount() {
//     this.tree.destroy();
//   }

//   render() {
//     return <div id="tree-div" ref={this.canvasRef} />;
//   }
// }
