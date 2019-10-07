import $ from 'jquery'
import d3 from 'd3'
import chroma from 'chroma-js';

var phylogram = {};
export default phylogram;

phylogram.create = function(el, props) {
  // console.log("phylogram.create()");
  var anchorElement = d3.select(el);
  anchorElement.selectAll("*").remove();
  var svg = anchorElement.append('svg')
    .attr('width', props.width)
    .attr('height', props.height);

  var g = svg.append("g");

  return phylogram.update(el, props);
}

phylogram.update = function(el, props) {
  // console.log("phylogram.update()");

  const {phyloTree, clustersPerSpecies, clusterColors} = props;

  let numLeafNodes = 0;
  let numNodes = 0;
  function countLeafNodes(node) {
    ++numNodes;
    if (node.children) {
      for (let i = 0; i < node.children.length; i++) {
        countLeafNodes(node.children[i]);
      }
    }
    else {
      ++numLeafNodes;
    }
  }
  if (phyloTree && phyloTree.children) {
    countLeafNodes(phyloTree);
  }
  console.log("PhyloTree size:", numNodes, "nodes", numLeafNodes, "leaf nodes");
  const calculatedHeight = numNodes * 20;

  props = Object.assign({
    autoResize: true,
    width: null, // null to set it to the width of the anchor element
    top: 20,
    bottom: 0,
    left: 10,
    right: 0,
    height: calculatedHeight,
  }, props);

  const anchorElement = d3.select(el);
  const svg = anchorElement.select("svg");
  if (svg.empty()) {
    console.log("Update map without created svg, calling create...");
    phylogram.create(el, props);
    return;
  }

  const g = svg.select("g");

  if (numLeafNodes === 0) {
    g.selectAll("*").remove();
    svg.attr("height", 100);
    return;
  }
  //TODO: Use data enter/exit!
  g.selectAll("*").remove();

  let totalWidth = props.width;
  if (!totalWidth)
    totalWidth = $(anchorElement.node()).innerWidth();

  const height = props.height - props.top - props.bottom;
  const width = totalWidth - props.left - props.right;

  svg.attr("width", totalWidth)
    .attr("height", props.height);

  g.attr("transform", `translate(${props.left}, ${props.top})`);



  phylogram.build('#phylogram', phyloTree, {
    width: width,
    height: height,
    vis: g,
    clustersPerSpecies,
    clusterColors,
    skipBranchLengthScaling: false,
    labelWidth: 250,
  });

  return phylogram;
}

/*
  phylogram.js
  Wrapper around a d3-based phylogram (tree where branch lengths are scaled)
  Also includes a radial dendrogram visualization (branch lengths not scaled)
  along with some helper methods for building angled-branch trees.

  Copyright (c) 2013, Ken-ichi Ueda
*/
phylogram.rightAngleDiagonal = function() {
  var projection = function(d) { return [d.y, d.x]; }

  var path = function(pathData) {
    return "M" + pathData[0] + ' ' + pathData[1] + " " + pathData[2];
  }

  function diagonal(diagonalPath, i) {
    var source = diagonalPath.source,
        target = diagonalPath.target,
        midpointX = (source.x + target.x) / 2,
        midpointY = (source.y + target.y) / 2,
        pathData = [source, {x: target.x, y: source.y}, target];
    pathData = pathData.map(projection);
    return path(pathData)
  }

  diagonal.projection = function(x) {
    if (!arguments.length) return projection;
    projection = x;
    return diagonal;
  };

  diagonal.path = function(x) {
    if (!arguments.length) return path;
    path = x;
    return diagonal;
  };

  return diagonal;
}

phylogram.radialRightAngleDiagonal = function() {
  return phylogram.rightAngleDiagonal()
    .path(function(pathData) {
      var src = pathData[0],
          mid = pathData[1],
          dst = pathData[2],
          radius = Math.sqrt(src[0]*src[0] + src[1]*src[1]),
          srcAngle = phylogram.coordinateToAngle(src, radius),
          midAngle = phylogram.coordinateToAngle(mid, radius),
          clockwise = Math.abs(midAngle - srcAngle) > Math.PI ? midAngle <= srcAngle : midAngle > srcAngle,
          rotation = 0,
          largeArc = 0,
          sweep = clockwise ? 0 : 1;
      return 'M' + src + ' ' +
        "A" + [radius,radius] + ' ' + rotation + ' ' + largeArc+','+sweep + ' ' + mid +
        'L' + dst;
    })
    .projection(function(d) {
      var r = d.y, a = (d.x - 90) / 180 * Math.PI;
      return [r * Math.cos(a), r * Math.sin(a)];
    })
}

// Convert XY and radius to angle of a circle centered at 0,0
phylogram.coordinateToAngle = function(coord, radius) {
  var wholeAngle = 2 * Math.PI,
      quarterAngle = wholeAngle / 4

  var coordQuad = coord[0] >= 0 ? (coord[1] >= 0 ? 1 : 2) : (coord[1] >= 0 ? 4 : 3),
      coordBaseAngle = Math.abs(Math.asin(coord[1] / radius))

  // Since this is just based on the angle of the right triangle formed
  // by the coordinate and the origin, each quad will have different
  // offsets
  switch (coordQuad) {
    case 1:
      coordAngle = quarterAngle - coordBaseAngle
      break
    case 2:
      coordAngle = quarterAngle + coordBaseAngle
      break
    case 3:
      coordAngle = 2*quarterAngle + quarterAngle - coordBaseAngle
      break
    case 4:
      coordAngle = 3*quarterAngle + coordBaseAngle
  }
  return coordAngle
}

function scaleBranchLengths(nodes, w) {
  // Visit all nodes and adjust y pos width distance metric
  var visitPreOrder = function(root, callback) {
    callback(root)
    if (root.children) {
      for (var i = root.children.length - 1; i >= 0; i--){
        visitPreOrder(root.children[i], callback)
      };
    }
  }
  visitPreOrder(nodes[0], function(node) {
    node.rootDist = (node.parent ? node.parent.rootDist : 0) + (node.length || 0)
  })
  var rootDists = nodes.map(function(n) { return n.rootDist; });
  var yscale = d3.scale.linear()
    .domain([0, d3.max(rootDists)])
    .range([0, w]);
  visitPreOrder(nodes[0], function(node) {
    node.y = yscale(node.rootDist)
  })
  return yscale
}


phylogram.build = function(selector, phyloTree, options) {
  options = options || {}
  var w = options.width || d3.select(selector).style('width') || d3.select(selector).attr('width'),
      h = options.height || d3.select(selector).style('height') || d3.select(selector).attr('height'),
      w = parseInt(w),
      h = parseInt(h),
      labelWidth = options.labelWidth || 200;
  w -= labelWidth;
  var tree = options.tree || d3.layout.cluster()
    .size([h, w])
    .sort(function(node) { return node.children ? node.children.length : -1; })
    .children(options.children || function(node) {
      return node.children
    });
  var diagonal = options.diagonal || phylogram.rightAngleDiagonal();
  var vis = options.vis || d3.select(selector).append("svg:svg")
      .attr("width", w + 300)
      .attr("height", h + 30)
    .append("svg:g")
      .attr("transform", "translate(20, 20)");
  // console.log("==== Before tree layout =====");
  var nodes = tree(phyloTree);
  // console.log("==== After tree layout =====");

  if (options.skipBranchLengthScaling) {
    var yscale = d3.scale.linear()
      .domain([0, w])
      .range([0, w]);
  } else {
    var yscale = scaleBranchLengths(nodes, w)
  }


  // Define the zoom function for the zoomable tree
  function zoom() {
      vis.attr("transform", "translate(" + d3.event.translate + ")scale(" + d3.event.scale + ")");
  }

  // define the zoomListener which calls the zoom function on the "zoom" event constrained within the scaleExtents
  // var zoomListener = d3.behavior.zoom()
  //   .scaleExtent([0.1, 3]).on("zoom", zoom);

  // vis.call(zoomListener);


  if (!options.skipTicks) {
    vis.selectAll('line')
        .data(yscale.ticks(10))
      .enter().append('svg:line')
        .attr('y1', 0)
        .attr('y2', h)
        .attr('x1', yscale)
        .attr('x2', yscale)
        .attr("stroke", "#ddd");

    vis.selectAll("text.rule")
        .data(yscale.ticks(10))
      .enter().append("svg:text")
        .attr("class", "rule")
        .attr("x", yscale)
        .attr("y", 0)
        .attr("dy", -3)
        .attr("text-anchor", "middle")
        .attr('font-size', '10px')
        .attr('fill', '#ccc')
        .text(function(d) { return Math.round(d*100) / 100; });
  }

  const {clustersPerSpecies, clusterColors} = options;

  function diagonalColor(d) {
    const { clusters } = d.target;
    if (!clusters || clusters.clusters.length === 0)
      return "#aaa";
    return clusterColors[clusters.clusters[0].clusterId];
  }

  var link = vis.selectAll("path.link")
      .data(tree.links(nodes))
    .enter().append("svg:path")
      .attr("class", "link")
      .attr("d", diagonal)
      .attr("fill", "none")
      // .attr("stroke", "#aaa")
      .attr("stroke", diagonalColor)
      .attr("stroke-width", "2px");

  var node = vis.selectAll("g.node")
      .data(nodes);

  node.enter().append("svg:g")
      .attr("class", (n) => n.children ? (n.depth === 0 ? "root node" : "inner node") : "leaf node")
      .attr("transform", (d) => `translate(${d.y},${d.x})`);

  node.exit().remove();

  var leafNodes = node.filter((d) => !d.children).append("g")
      // .attr("transform", "translate(10,0)");

  var arc = d3.svg.arc()
      .outerRadius(10)
      .innerRadius(0);

  var pie = d3.layout.pie()
      .sort(null)
      .value(function(d) { return d.count; });

  const fillColor = (clusterId) => clusterId === 'rest' ? '#eee' : clusterColors[clusterId];

  var clusterData = (d) => {
    if (!d.clusters || d.clusters.totCount === 0)
      return [{count: 1}];
    return d.clusters.clusters;
  };

  var pies = node.selectAll(".pie")
      .data(d => pie(clusterData(d)));

  pies.enter().append("path")
      .attr("class", "pie")

  pies.exit().remove();

  pies.attr("d", arc)
      .style("stroke", (d) => d.data.clusterId !== undefined ? "white" : "grey")
      .style("fill", (d) => d.data.clusterId !== undefined ? fillColor(d.data.clusterId) : "white");

  if (!options.skipLabels) {
    node.append("svg:text")
      .attr("dx", -16)
      .attr("dy", -3)
      .attr("text-anchor", 'end')
      .attr('font-size', '8px')
      .attr('fill', '#ccc')
      .text((d) => d.length);

    leafNodes.append("svg:text")
      .attr("dx", 15)
      .attr("dy", 3)
      .attr("text-anchor", "start")
      .attr('font-family', 'Helvetica Neue, Helvetica, sans-serif')
      .attr('font-size', '10px')
      .attr('fill', 'black')
      .text((d) => d.name);
  }
  // console.log("==== Phylogram rendered! =====");

  return {tree: tree, vis: vis}
}

phylogram.buildRadial = function(selector, nodes, options) {
  options = options || {}
  var w = options.width || d3.select(selector).style('width') || d3.select(selector).attr('width'),
      r = w / 2,
      labelWidth = options.skipLabels ? 10 : options.labelWidth || 120;

  var vis = d3.select(selector).append("svg:svg")
      .attr("width", r * 2)
      .attr("height", r * 2)
    .append("svg:g")
      .attr("transform", "translate(" + r + "," + r + ")");

  var tree = d3.layout.tree()
    .size([360, r - labelWidth])
    .sort(function(node) { return node.children ? node.children.length : -1; })
    .children(options.children || function(node) {
      return node.children
    })
    .separation(function(a, b) { return (a.parent == b.parent ? 1 : 2) / a.depth; });

  var _phylogram = phylogram.build(selector, nodes, {
    vis: vis,
    tree: tree,
    skipBranchLengthScaling: true,
    skipTicks: true,
    skipLabels: options.skipLabels,
    diagonal: phylogram.radialRightAngleDiagonal(),
    width: options.width,
    height: options.height,
  })
  vis.selectAll('g.node')
    .attr("transform", function(d) { return "rotate(" + (d.x - 90) + ")translate(" + d.y + ")"; })

  if (!options.skipLabels) {
    vis.selectAll('g.leaf.node text')
      .attr("dx", function(d) { return d.x < 180 ? 8 : -8; })
      .attr("dy", ".31em")
      .attr("text-anchor", function(d) { return d.x < 180 ? "start" : "end"; })
      .attr("transform", function(d) { return d.x < 180 ? null : "rotate(180)"; })
      .attr('font-family', 'Helvetica Neue, Helvetica, sans-serif')
      .attr('font-size', '10px')
      .attr('fill', 'black')
      .text(function(d) { return d.data.name; });

    vis.selectAll('g.inner.node text')
      .attr("dx", function(d) { return d.x < 180 ? -6 : 6; })
      .attr("text-anchor", function(d) { return d.x < 180 ? "end" : "start"; })
      .attr("transform", function(d) { return d.x < 180 ? null : "rotate(180)"; });
  }

  return {tree: tree, vis: vis}
}

phylogram.destroy = function(el) {
  console.log("phylogram::destroy()");
}
