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

  add(feature, maxNodeSizeLog2, minNodeSizeLog2, nodeCapacity) {
    if (!this.isLeaf)
      return this.addChild(feature, maxNodeSizeLog2, minNodeSizeLog2, nodeCapacity);

    const sizeLog2 = Math.log2(this.x2 - this.x1);

    // Force create children
    if (sizeLog2 > maxNodeSizeLog2) {
      return this.addChild(feature, maxNodeSizeLog2, minNodeSizeLog2, nodeCapacity);
    }

    // Allow no more children
    if (sizeLog2 <= minNodeSizeLog2) {
      return this.features.push(feature);
    }

    // In-between size bounds, create children if overflowing density threshold
    if (this.features.length === nodeCapacity) {
      this.features.forEach((feature) => {
        this.addChild(feature, maxNodeSizeLog2, minNodeSizeLog2, nodeCapacity);
      });
      this.features = [];
    }
    else {
      this.features.push(feature);
    }
  }

  // Recursively inserts the specified point or polygon into descendants of
  // this node.
  addChild(feature, maxNodeSizeLog2, minNodeSizeLog2, nodeCapacity) {
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
      child.add(feature, maxNodeSizeLog2, minNodeSizeLog2, nodeCapacity);
    }
    else {
      console.log(`Warning: Binning geometry of type ${geom.type} not implemented`);
    }
    // else if (geom.type === "Polygon") {
    //   // console.log(">> Add POLYGON");
    //   let addWithPointSampling = false; // TODO: Intersection test better for small node sizes?
    //   if (addWithPointSampling) {
    //     const minNodeSize = Math.pow(2, minNodeSizeLog2);
    //     const halfMinNodeSize = minNodeSize / 2;
    //     const subStep = minNodeSize / 10;
    //     const bbox = getBBox(feature);
    //     const bboxWidth = bbox[2] - bbox[0];
    //     const bboxHeight = bbox[3] - bbox[1];
    //     const [bboxSizeMin, bboxSizeMax] = bboxWidth < bboxHeight ? [bboxWidth, bboxHeight] : [bboxHeight, bboxWidth];
    //     if (bboxSizeMax < minNodeSize) {
    //       // If feature less than minimum cell size, add points at centre
    //       const pointFeature = turfPoint([bbox[0] + bboxWidth/2, bbox[1] + bboxHeight/2], feature.properties);
    //       this.addChild(pointFeature, maxNodeSizeLog2, minNodeSizeLog2, nodeCapacity);
    //       // const long = bbox[0] + halfMinNodeSize;
    //       // const lat = bbox[1] + halfMinNodeSize;
    //       // for (let x = long - halfMinNodeSize; x < long + halfMinNodeSize; x += subStep) {
    //       //   for (let y = lat - halfMinNodeSize; y < lat + halfMinNodeSize; y += subStep) {
    //       //     const pointFeature = turfPoint([x, y], feature.properties);
    //       //     this.addChild(pointFeature, maxNodeSizeLog2, minNodeSizeLog2, nodeCapacity);
    //       //   }
    //       // }
    //     }
    //     else {
    //       for (let long = bbox[0] + halfMinNodeSize; long < bbox[2]; long += minNodeSize) {
    //         for (let lat = bbox[1] + halfMinNodeSize; lat < bbox[3]; lat += minNodeSize) {
    //           const pointFeature = turfPoint([long, lat], feature.properties);
    //           if (turfInside(pointFeature, feature)) {
    //             this.addChild(pointFeature, maxNodeSizeLog2, minNodeSizeLog2, nodeCapacity);
    //             // for (let x = long - halfMinNodeSize; x < long + halfMinNodeSize; x += subStep) {
    //             //   for (let y = lat - halfMinNodeSize; y < lat + halfMinNodeSize; y += subStep) {
    //             //     const subPointFeature = turfPoint([x, y], feature.properties);
    //             //     this.addChild(subPointFeature, maxNodeSizeLog2, minNodeSizeLog2, nodeCapacity);
    //             //   }
    //             // }
    //           }
    //         }
    //       }
    //     }
    //   }
    //   else {
    //     // Polygon feature, check intersection with quadtree children, indexed as order below
    //     const featureCoordinates = feature.geometry.coordinates;
    //     const topLeft = Polygon([[
    //       [x1, ym],
    //       [xm, ym],
    //       [xm, y2],
    //       [x1, y2],
    //       [x1, ym],
    //     ]]);
    //     const topRight = Polygon([[
    //       [xm, ym],
    //       [x2, ym],
    //       [x2, y2],
    //       [xm, y2],
    //       [xm, ym],
    //     ]]);
    //     const lowerLeft = Polygon([[
    //       [x1, y1],
    //       [xm, y1],
    //       [xm, ym],
    //       [x1, ym],
    //       [x1, y1],
    //     ]]);
    //     const lowerRight = Polygon([[
    //       [xm, y1],
    //       [x2, y1],
    //       [x2, ym],
    //       [xm, ym],
    //       [xm, y1],
    //     ]]);
    //     // const topLeft = Polygon([[
    //     //   [x1, ym],
    //     //   [x1, y2],
    //     //   [xm, y2],
    //     //   [xm, ym],
    //     //   [x1, ym],
    //     // ]]);
    //     // const topRight = Polygon([[
    //     //   [xm, ym],
    //     //   [xm, y2],
    //     //   [x2, y2],
    //     //   [x2, ym],
    //     //   [xm, ym],
    //     // ]]);
    //     // const lowerLeft = Polygon([[
    //     //   [x1, y1],
    //     //   [x1, ym],
    //     //   [xm, ym],
    //     //   [xm, y1],
    //     //   [x1, y1],
    //     // ]]);
    //     // const lowerRight = Polygon([[
    //     //   [xm, y1],
    //     //   [xm, ym],
    //     //   [x2, ym],
    //     //   [x2, y1],
    //     //   [xm, y1],
    //     // ]]);

    //     // const [xLow, yLow, xHigh, yHigh] = turfExtent(feature);
    //     // const envelope = turfEnvelope(feature);
    //     // const bboxPoly = envelope.geometry.coordinates[0];

    //     // const topLeftIntersection = turfIntersect(topLeft, feature);
    //     // const topRightIntersection = turfIntersect(topRight, feature);
    //     // const lowerLeftIntersection = turfIntersect(lowerLeft, feature);
    //     // const lowerRightIntersection = turfIntersect(lowerRight, feature);
    //     const topLeftIntersection = intersection(feature, topLeft);
    //     const topRightIntersection = intersection(feature, topRight);
    //     const lowerLeftIntersection = intersection(feature, lowerLeft);
    //     const lowerRightIntersection = intersection(feature, lowerRight);
    //     // const topLeftIntersection = intersection(feature, topLeft, this.size()/8);
    //     // const topRightIntersection = intersection(feature, topRight, this.size()/8);
    //     // const lowerLeftIntersection = intersection(feature, lowerLeft, this.size()/8);
    //     // const lowerRightIntersection = intersection(feature, lowerRight, this.size()/8);
    //     // if (topLeftIntersection || topRightIntersection || lowerLeftIntersection || lowerRightIntersection) {
    //     //   console.log("INTERSECTION:", topLeftIntersection, topRightIntersection, lowerLeftIntersection, lowerRightIntersection);
    //     // }


    //     if (topLeftIntersection) {
    //       let child = this.children[0] || (this.children[0] = new Node(x1, ym, xm, y2));
    //       child.add(topLeftIntersection, maxNodeSizeLog2, minNodeSizeLog2, nodeCapacity);
    //     }
    //     if (topRightIntersection) {
    //       let child = this.children[1] || (this.children[1] = new Node(xm, ym, x2, y2));
    //       child.add(topRightIntersection, maxNodeSizeLog2, minNodeSizeLog2, nodeCapacity);
    //     }
    //     if (lowerLeftIntersection) {
    //       let child = this.children[2] || (this.children[2] = new Node(x1, y1, xm, ym));
    //       child.add(lowerLeftIntersection, maxNodeSizeLog2, minNodeSizeLog2, nodeCapacity);
    //     }
    //     if (lowerRightIntersection) {
    //       let child = this.children[3] || (this.children[3] = new Node(xm, y1, x2, ym));
    //       child.add(lowerRightIntersection, maxNodeSizeLog2, minNodeSizeLog2, nodeCapacity);
    //     }
    //   }
    // }
    // else if (geom.type === "MultiPolygon") {
    //   // console.log(">> Add MULTI_POLYGON");
    //   geom.coordinates.forEach(polygonCoords => {
    //     this.addChild(Polygon(polygonCoords, feature.properties), maxNodeSizeLog2, minNodeSizeLog2, nodeCapacity);
    //   });
    // }
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

  patchSparseNodes(maxNodeSizeLog2, lowerThreshold) {
    if (this.isLeaf)
      return this.features;
    // Already patched if features at non-leaf node.
    if (this.features.length > 0) {
      return this.features;
    }
    let nonEmptyChildren = this.children.filter((child) => child !== undefined);
    let sparseChildren = nonEmptyChildren.filter(child => child.isLeaf && child.features.length < lowerThreshold);
    const sizeLog2 = Math.log2(this.x2 - this.x1);
    let doPatch = (sizeLog2 <= maxNodeSizeLog2) && (nonEmptyChildren.length < 4 || sparseChildren.length > 0);
    let aggregatedFeatures = [];
    nonEmptyChildren.forEach((child) => {
      const childFeatures = child.patchSparseNodes(maxNodeSizeLog2, lowerThreshold);
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
    this._nodeCapacity = 10;
    this._lowerThreshold = 0; //
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

  nodeCapacity(_) {
    return arguments.length ? (this._nodeCapacity = _, this) : this._nodeCapacity;
  }

  lowerThreshold(_) {
    return arguments.length ? (this._lowerThreshold = _, this) : this._lowerThreshold;
  }

  visit(callback) {
    return this._root.visit(callback);
  }

  visitNonEmpty(callback) {
    return this._root.visitNonEmpty(callback);
  }

  addFeatures(features) {
    features.forEach((feature) => {
      this._root.add(feature, this._maxNodeSizeLog2, this._minNodeSizeLog2, this._nodeCapacity);
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
  * @param features The features to bin, else assume added by addFeatures
  * @param patchSparseNodes {Boolean} Keep parent cell behind sub-cells if
  * some but not all four sub-cells get the minimum number of records to be
  * included. Default false.
  * @return an Array of quadtree nodes
  */
  bins(features = null, patchSparseNodes = false) {
    if (features) {
      this.clear();
      this.addFeatures(features);
    }
    if (patchSparseNodes) {
      this._root.patchSparseNodes(this._maxNodeSizeLog2, this._lowerThreshold);
    }
    var nodes = [];
    this.visitNonEmpty((node) => {
      // Skip biggest non-empty nodes if its number of features are below the lower threshold
      if (node.features.length < this._lowerThreshold) {
        return true;
      }
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
