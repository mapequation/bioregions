function pointX(p) {
  return p[0];
}

function pointY(p) {
  return p[1];
}

class Node {
  constructor(x1, y1, x2, y2) {
    this.x1 = x1;
    this.y1 = y1;
    this.x2 = x2;
    this.y2 = y2;
    this.isLeaf = true;
    this.points = [];
    this.children = []; // at index 0,1,2,3
  }

  size() {
    const dx = this.x2 - this.x1;
    return dx * dx;
  }

  add(point, x, y, maxNodeSize, minNodeSize, densityThreshold) {
    if (!this.isLeaf)
      return this.addChild(point, x, y, maxNodeSize, minNodeSize, densityThreshold);

    let width = this.x2 - this.x1;

    // Force create children
    if (width > maxNodeSize) {
      return this.addChild(point, x, y, maxNodeSize, minNodeSize, densityThreshold);
    }

    // Allow no more children
    if (width <= minNodeSize) {
      return this.points.push(point);
    }

    // In-between size bounds, create children if overflowing density threshold
    if (this.points.length === densityThreshold) {
      this.points.forEach((point) => {
        this.addChild(point, x, y, maxNodeSize, minNodeSize, densityThreshold);
      });
      this.points = [];
    }
    else {
      this.points.push(point);
    }
  }

  // Recursively inserts the specified point [x, y] into a descendant of
  // this node.
  addChild(point, x, y, maxNodeSize, minNodeSize, densityThreshold) {
    // Compute the split point, and the quadrant in which to insert the point.
    let {x1, x2, y1, y2} = this;
    var xm = (x1 + x2) * .5,
        ym = (y1 + y2) * .5,
        right = x >= xm,
        below = y >= ym,
        i = below << 1 | right;

    // Update the bounds as we recurse.
    if (right) x1 = xm; else x2 = xm;
    if (below) y1 = ym; else y2 = ym;

    // Recursively insert into the child node.
    this.isLeaf = false;
    let child = this.children[i] || (this.children[i] = new Node(x1, y1, x2, y2));
    child.add(point, x, y, maxNodeSize, minNodeSize, densityThreshold);
  }

  visitNonEmpty(callback) {
    if (this.points.length > 0) {
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

  patchPartiallyEmptyNodes(maxNodeSize) {
    if (this.isLeaf)
      return this.points;
    // Already patched if points at non-leaf node.
    if (this.points.length > 0) {
      return this.points;
    }
    let nonEmptyChildren = this.children.filter((child) => child !== undefined);
    let size = this.x2 - this.x1;
    let doPatch = (size < maxNodeSize) && this.points.length === 0 && nonEmptyChildren.length < 4;
    let aggregatedPoints = [];
    nonEmptyChildren.forEach((child) => {
      const childPoints = child.patchPartiallyEmptyNodes(maxNodeSize);
      aggregatedPoints = aggregatedPoints.concat(...childPoints);
    });
    if (doPatch) {
      this.points = aggregatedPoints;
    }
    return aggregatedPoints;
  }
}

export default class QuadtreeBinner {
  constructor() {
    this._extent = [[-180, -90], [180, 90]];
    this._maxNodeSize = 10;
    this._minNodeSize = 1;
    this._densityThreshold = 10;
    this._x = pointX;
    this._y = pointY;
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

  maxNodeSize(_) {
    return arguments.length ? (this._maxNodeSize = _, this) : this._maxNodeSize;
  }

  minNodeSize(_) {
    return arguments.length ? (this._minNodeSize = _, this) : this._minNodeSize;
  }

  densityThreshold(_) {
    return arguments.length ? (this._densityThreshold = _, this) : this._densityThreshold;
  }

  x(_) {
    return arguments.length ? (this._x = _, this) : this._x;
  }

  y(_) {
    return arguments.length ? (this._y = _, this) : this._y;
  }

  visit(callback) {
    return this._root.visit(callback);
  }

  visitNonEmpty(callback) {
    return this._root.visitNonEmpty(callback);
  }

  addPoints(points) {
    points.forEach((point) => {
      let x = +this._x(point);
      let y = +this._y(point);
      if (!isNaN(x) && !isNaN(y)) // ignore invalid points
        this._root.add(point, x, y, this._maxNodeSize, this._minNodeSize, this._densityThreshold);
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
  * Get all bins less than maxNodeSize
  * If the bin have partially filled children (1-3 children non-empty)
  * the points array of that bin is an aggregation of the points below
  * @param points The points to bin, else assume added by addPoints
  * @return an Array of quadtree nodes
  */
  bins(points = null) {
    if (points) {
      this.clear();
      this.addPoints(points);
    }
    this._root.patchPartiallyEmptyNodes(this._maxNodeSize);
    var nodes = [];
    this.visitNonEmpty(function(node) {
      nodes.push(node);
    });
    if (points) {
      // If points are provided, assume completely functional
      this.clear();
    }
    return nodes;
  }

  renderer(projection) {
    return function(d) {
      return "M" + [[d.x1,d.y1], [d.x2,d.y1], [d.x2,d.y2], [d.x1,d.y2]].map((point) => projection(point)).join("L") + "Z";
    };
  }
}
