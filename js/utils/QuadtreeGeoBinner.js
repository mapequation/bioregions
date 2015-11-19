// import turfPolygon from 'turf-polygon';
// import turfIntersect from 'turf-intersect';
// import turfSimplify from 'turf-simplify';
// import turfExtent from 'turf-extent';
// import turfCentroid from 'turf-centroid';
// import {bboxIntersect} from './polygons';

class Node {
  constructor(x1, y1, x2, y2) {
    this.x1 = x1;
    this.y1 = y1;
    this.x2 = x2;
    this.y2 = y2;
    this.isLeaf = true;
    this.features = [];
    this.children = []; // at index 0,1,2,3
    this.clusterId = -1;
  }

  size() {
    return this.x2 - this.x1;
  }

  area() {
    const dx = this.x2 - this.x1;
    return dx * dx;
  }

  add(feature, maxNodeSizeLog2, minNodeSizeLog2, densityThreshold) {
    if (!this.isLeaf)
      return this.addChild(feature, maxNodeSizeLog2, minNodeSizeLog2, densityThreshold);

    const sizeLog2 = Math.log2(this.x2 - this.x1);

    // Force create children
    if (sizeLog2 > maxNodeSizeLog2) {
      return this.addChild(feature, maxNodeSizeLog2, minNodeSizeLog2, densityThreshold);
    }

    // Allow no more children
    if (sizeLog2 <= minNodeSizeLog2) {
      return this.features.push(feature);
    }

    // In-between size bounds, create children if overflowing density threshold
    if (this.features.length === densityThreshold) {
      this.features.forEach((feature) => {
        this.addChild(feature, maxNodeSizeLog2, minNodeSizeLog2, densityThreshold);
      });
      this.features = [];
    }
    else {
      this.features.push(feature);
    }
  }

  // Recursively inserts the specified point or polygon into descendants of
  // this node.
  addChild(feature, maxNodeSizeLog2, minNodeSizeLog2, densityThreshold) {
    // Compute the split point, and the quadrant in which to insert the point.
    let {x1, x2, y1, y2} = this;
    var xm = (x1 + x2) * .5,
        ym = (y1 + y2) * .5;

    // Recursively insert into the child node.
    this.isLeaf = false;
    const geom = feature.geometry;

    if (geom.type === "Point") {
      var [x, y] = geom.coordinates;
      var right = x >= xm,
          below = y >= ym,
          i = below << 1 | right;

      // Update the bounds as we recurse.
      if (right) x1 = xm; else x2 = xm;
      if (below) y1 = ym; else y2 = ym;

      let child = this.children[i] || (this.children[i] = new Node(x1, y1, x2, y2));
      child.add(feature, maxNodeSizeLog2, minNodeSizeLog2, densityThreshold);
    }
    else {
      // Polygon feature, check intersection with quadtree children, indexed as order below
      // const topLeft = turfPolygon([[
      //   [x1, ym],
      //   [x1, y2],
      //   [xm, y2],
      //   [xm, ym],
      //   [x1, ym]
      // ]]);
      // const topRight = turfPolygon([[
      //   [xm, ym],
      //   [xm, y2]
      //   [x2, y2],
      //   [x2, ym],
      //   [xm, ym],
      // ]]);
      // const lowerLeft = turfPolygon([[
      //   [x1, y1],
      //   [x1, ym],
      //   [xm, ym],
      //   [xm, y1],
      //   [x1, y1]
      // ]]);
      // const lowerRight = turfPolygon([[
      //   [xm, y1],
      //   [xm, ym]
      //   [x2, ym],
      //   [x2, y1],
      //   [xm, y1],
      // ]]);

      // var [xLow, yLow, xHigh, yHigh] = turfExtent(feature);
      //
      // const topLeftIntersect = bboxIntersect(feature, [x1, ym, xm, y2]);
      // const topRightIntersect = bboxIntersect(feature, [xm, ym, x2, y2]);
      // const lowerLeftIntersect = bboxIntersect(feature, [x1, y1, xm, ym]);
      // const lowerRightIntersect = bboxIntersect(feature, [xm, y1, x2, ym]);
      // // const topLeftIntersect = turfIntersect(topLeft, feature);
      // // const topRightIntersect = turfIntersect(topRight, feature);
      // // const lowerLeftIntersect = turfIntersect(lowerLeft, feature);
      // // const lowerRightIntersect = turfIntersect(lowerRight, feature);
      // // console.log(topLeftIntersect, topRightIntersect, lowerLeftIntersect, lowerRightIntersect);
      //
      // if (topLeftIntersect) {
      //   let child = this.children[0] || (this.children[0] = new Node(x1, ym, xm, y2));
      //   child.add(feature, maxNodeSizeLog2, minNodeSizeLog2, densityThreshold);
      // }
      // if (topRightIntersect) {
      //   let child = this.children[1] || (this.children[1] = new Node(xm, ym, x2, y2));
      //   child.add(feature, maxNodeSizeLog2, minNodeSizeLog2, densityThreshold);
      // }
      // if (lowerLeftIntersect) {
      //   let child = this.children[2] || (this.children[2] = new Node(x1, y1, xm, ym));
      //   child.add(feature, maxNodeSizeLog2, minNodeSizeLog2, densityThreshold);
      // }
      // if (lowerRightIntersect) {
      //   let child = this.children[3] || (this.children[3] = new Node(xm, y1, x2, ym));
      //   child.add(feature, maxNodeSizeLog2, minNodeSizeLog2, densityThreshold);
      // }
    }
  }

  visitNonEmpty(callback) {
    if (this.features.length > 0) {
      if (callback(this))
        return; // early exit if callback returns true
    }
    for (let i = 0; i < 4; ++i)
      this.children[i] && this.children[i].visitNonEmpty(callback);
  }

  visit(callback) {
    if (callback(this))
      return; // early exit if callback returns true
    for (let i = 0; i < 4; ++i)
      this.children[i] && this.children[i].visit(callback);
  }

  patchPartiallyEmptyNodes(maxNodeSizeLog2) {
    if (this.isLeaf)
      return this.features;
    // Already patched if features at non-leaf node.
    if (this.features.length > 0) {
      return this.features;
    }
    let nonEmptyChildren = this.children.filter((child) => child !== undefined);
    const sizeLog2 = Math.log2(this.x2 - this.x1);
    let doPatch = (sizeLog2 <= maxNodeSizeLog2) && this.features.length === 0 && nonEmptyChildren.length < 4;
    let aggregatedFeatures = [];
    nonEmptyChildren.forEach((child) => {
      const childFeatures = child.patchPartiallyEmptyNodes(maxNodeSizeLog2);
      childFeatures.forEach((feature) => {
        aggregatedFeatures.push(feature);
      });
    });
    if (doPatch) {
      this.features = aggregatedFeatures;
    }
    return aggregatedFeatures;
  }
}

/**
* Quadtree GeoJSON binner
* @TODO: Support polygon types (assume point types now)
*/
export default class QuadtreeGeoBinner {
  constructor() {
    // this._extent = [[-180, -90], [180, 90]];
    this._extent = [[-256, -256], [256, 256]]; // power of 2 to get 1x1 degree grid cells
    // this._extent = [[-180, -90], [512-180, 512-90]]; // power of 2 to get 1x1 degree grid cells
    this._maxNodeSizeLog2 = 4;
    this._minNodeSizeLog2 = -3;
    this._densityThreshold = 10;
    this._root = null;
    this.initRoot();
  }

  initRoot() {
    this._root = new Node(this._extent[0][0], this._extent[0][1], this._extent[1][0], this._extent[1][1]);
  }

  extent(_) {
    if (!arguments.length)
      return this._extent;
    this._extent = _;
    // Squarify the bounds.
    let [[x1, y1], [x2,y2]] = this._extent;
    var dx = x2 - x1,
        dy = y2 - y1;
    if (isFinite(dx) && isFinite(dy)) {
      if (dx > dy) y2 = y1 + dx;
      else x2 = x1 + dy;
    }
    this._extent = [[x1, y1], [x2, y2]];
    this.initRoot();
    return this;
  }

  maxNodeSizeLog2(_) {
    return arguments.length ? (this._maxNodeSizeLog2 = _, this) : this._maxNodeSizeLog2;
  }

  minNodeSizeLog2(_) {
    return arguments.length ? (this._minNodeSizeLog2 = _, this) : this._minNodeSizeLog2;
  }

  densityThreshold(_) {
    return arguments.length ? (this._densityThreshold = _, this) : this._densityThreshold;
  }

  visit(callback) {
    return this._root.visit(callback);
  }

  visitNonEmpty(callback) {
    return this._root.visitNonEmpty(callback);
  }

  addFeatures(features) {
    features.forEach((feature) => {
      this._root.add(feature, this._maxNodeSizeLog2, this._minNodeSizeLog2, this._densityThreshold);
    });
    return this;
  }

  clear() {
    this.initRoot();
  }

  /**
  * Get all non-empty grid cells
  * @return an Array of quadtree nodes
  */
  binsNonEmpty() {
    var nodes = [];
    this.visitNonEmpty(function(node) {
      nodes.push(node);
    });
    return nodes;
  }

  /**
  * Get all bins less than maxNodeSizeLog2
  * If the bin have partially filled children (1-3 children non-empty)
  * the features array of that bin is an aggregation of the features below
  * @param features The features to bin, else assume added by addFeatures
  * @return an Array of quadtree nodes
  */
  bins(features = null) {
    if (features) {
      this.clear();
      this.addFeatures(features);
    }
    this._root.patchPartiallyEmptyNodes(this._maxNodeSizeLog2);
    var nodes = [];
    this.visitNonEmpty(function(node) {
      nodes.push(node);
    });
    if (features) {
      // If features are provided, assume completely functional
      this.clear();
    }
    return nodes;
  }

  static renderer(projection) {
    return function(d) {
      return "M" + [[d.x1,d.y1], [d.x2,d.y1], [d.x2,d.y2], [d.x1,d.y2]].map((point) => projection(point)).join("L") + "Z";
    };
  }

}
