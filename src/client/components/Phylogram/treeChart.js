import $ from 'jquery'
import d3 from 'd3'
import chroma from 'chroma-js';
import treeUtils from '../../utils/treeUtils'

const chart = {};
export default chart;
var phylogram = {};

chart.render = function(el, props) {
    console.log("chart.update()");

    const svg = d3.select(el);
    const {
        phyloTree,
        clustersPerSpecies,
        clusterColors
    } = props;

    if (!phyloTree) {
        svg.selectAll('*').remove();
        svg.attr("height", 10);
        return;
    }

    // const root = phyloTree;
    // root.children && root.children.forEach(treeUtils.collapse);
    
    const leafNodes = [];
    let numNodes = 0;
    let maxDepth = 0;
    treeUtils.visitTreeDepthFirst(phyloTree, (node, depth) => {
        ++numNodes;
        if (node.isLeaf) {
            leafNodes.push(node);
            if (depth > maxDepth) {
                maxDepth = depth;
            }
        }
    });
    const numLeafNodes = leafNodes.length;

    console.log(`[treeChart], numLeafNodes: ${numLeafNodes}, numNodes: ${numNodes}, maxDepth: ${maxDepth}`);

    if (numLeafNodes === 0) {
        svg.selectAll('*').remove();
        svg.attr("height", 10);
        return;
    }
    svg.selectAll('*').remove();


    const innerDiameter = Math.max(16 * numLeafNodes / Math.PI, 200);
    const labelWidth = 250;
    const outerDiameter = 2 * labelWidth + innerDiameter;
    const R = outerDiameter / 2;
    const r = innerDiameter / 2;
    //   const calculatedWidth = maxDepth * 20;
    //   const calculatedHeight = numNodes * 20;
    //   const calculatedHeight = numLeafNodes * 20;

    let g = svg.select('g');
    if (g.empty()) {
        g = svg.append('g');
    }

    svg.attr("width", outerDiameter)
        .attr("height", outerDiameter);

    g.attr("transform", `translate(${R}, ${R})`);


    var cluster = d3.layout.cluster()
        .size([360, 1])
        .sort(null)
        .value(d => d.length)
        .separation((a, b) => 1);
        // .separation((a, b) => (a.parent === b.parent ? 1 : 2) / a.depth );

    function project(d) {
        let r = d.y,
            a = (d.x - 90) / 180 * Math.PI;
        return [r * Math.cos(a), r * Math.sin(a)];
    }

    const nodes = cluster.nodes(phyloTree);
    const yscale = scaleBranchLengths(nodes, r - 20);
    nodes.forEach(node => { node.y = yscale(node.rootDist); });
    
    const vis = g;
    
    function step(d) {
        var s = project(d.source),
            m = project({x: d.target.x, y: d.source.y}),
            t = project(d.target),
            r = d.source.y,
            sweep = d.target.x > d.source.x ? 1 : 0;
        return (
            "M" + s[0] + "," + s[1] +
            "A" + r + "," + r + " 0 0," + sweep + " " + m[0] + "," + m[1] +
            "L" + t[0] + "," + t[1]);
    }

    var arc = d3.svg.arc()
        .outerRadius(5)
        .innerRadius(0);

    var pie = d3.layout.pie()
        .sort(null)
        .value(d => d.count);

    const fillColor = (clusterId) => {
        if (clusterId >= 0)
            return clusterColors[clusterId];
        if (clusterId === 'rest')
            return '#eee';
        return 'white';
    }

    function biggestClusterColor(d) {
        return d.clusters.clusters.length === 0 ? '#aaa' : clusterColors[d.clusters.clusters[0].clusterId];
    }
    
    var clusterData = (d) => {
        if (!d.clusters || d.clusters.totCount === 0)
            return [{
                count: 1
            }];
        return d.clusters.clusters;
    };
    
    var radialAxis = vis.selectAll(".axis")
        .data(yscale.ticks(5).slice(2))
    .enter().append("g")
        .attr("class", "axis");

    radialAxis.append("circle")
        .attr("r", yscale)
        .style("fill", "none")
        .style("stroke", "#777")
        .style("stroke-dasharray", "1,4");

    radialAxis.append("text")
        .attr("y", d => yscale(d) + 0)
        // .attr("transform", "rotate(15)")
        .attr("dy", "1em")
        .style("text-anchor", "middle")
        .style("stroke", "#ccc")
        .style("font-family", "'Open Sans', Helvetica, sans-serif")
        .text(d => d);


    var link = vis.selectAll("path.link")
        .data(cluster.links(nodes))
       .enter().append("path")
        .attr("class", "link")
        .attr("fill", "none")
        .attr("stroke", (d) => biggestClusterColor(d.target))
        .attr("stroke-width", "4px")
        .attr("d", step);

    var node = vis.selectAll("g.node")
        .data(nodes);
    
    node.enter()
        .append("g")
        .attr("class", "node")
        .attr("transform", (d) => `rotate(${d.x - 90})translate(${d.y})`)
        .on("click", d => {
            console.log(`Click tree node:`, d)
        });
    
    node.exit().remove();

    var pies = node.selectAll(".pie")
        .data(d => pie(clusterData(d)));

    pies.enter().append("path")
        .attr("class", "pie")

    pies.exit().remove();

    pies.attr("d", arc)
        .style("stroke", (d) => d.data.clusterId !== undefined ? "white" : "grey")
        .style("fill", (d) => d.data.clusterId !== undefined ? fillColor(d.data.clusterId) : "white");
    


    var label = vis.selectAll(".label")
        .data(leafNodes)
      .enter().append("text")
        .attr("class", "label")
        .attr("dy", ".31em")
        .attr("text-anchor", d => d.x < 180 ? "start" : "end")
        .attr("transform", d => {
            return "rotate(" + (d.x - 90) + ")translate(" + (r) + ")rotate(" + (d.x < 180 ? 0 : 180) + ")";
        })
        .attr("stroke", biggestClusterColor)
        .attr("font-family", "'Open Sans', Helvetica, sans-serif")
        .text(d => d.name);




    //   phylogram.buildRadial('#phylogram', phyloTree, {
    //     width: width,
    //     height: height,
    //     vis: g,
    //     clustersPerSpecies,
    //     clusterColors,
    //     skipBranchLengthScaling: false,
    //     labelWidth: 250,
    //   });


    // var i = 0,
    //     duration = 750;

    // var tree = d3.layout.tree()
    //     .size([height, width]);

    // var tree = d3.layout.tree()
    //     .size([360, diameter / 2 - 80])
    //     .separation(function(a, b) { return (a.parent === b.parent ? 1 :2) / a.depth; });


    // var diagonal = d3.svg.diagonal()
    //     // .projection(function(d) { return [d.y, d.x]; });
    //     .projection(function(d) { return [d.y, d / 180 * Math.PI.x]; });
    // var diagonal = d3.svg.diagonal.radial()
    //     .projection(function(d) { return [d.y, d.x / 180 * Math.PI]; });

    // root.x0 = height / 2;
    // root.y0 = 0;

    // update(root);

    // function update(source) {

    //     // Compute the new tree layout.
    //     var nodes = tree.nodes(root).reverse(),
    //         links = tree.links(nodes);

    //     // Normalize for fixed-depth.
    //     nodes.forEach(function(d) { d.y = d.depth * 80; });
    //     // Normalize for fixed-depth.;

    //     // Update the nodes…
    //     var node = g.selectAll("g.node")
    //         .data(nodes, function(d) { return d.id || (d.id = ++i); });

    //     // Enter any new nodes at the parent's previous position.
    //     var nodeEnter = node.enter().append("g")
    //         .attr("class", "node")
    //         .attr("transform", function(d) { return "translate(" + source.y0 + "," + source.x0 + ")"; })
    //         // .on("click", click);

    //     nodeEnter.append("circle")
    //         // .attr("r", 1e-6)
    //         .attr("r", 10)
    //         .style("fill", function(d) { return d._children ? "lightsteelblue" : "#fff"; });

    //     nodeEnter.append("text")
    //         .attr("x", function(d) { return d.children || d._children ? -10 : 10; })
    //         .attr("dy", ".35em")
    //         .attr("text-anchor", function(d) { return d.children || d._children ? "end" : "start"; })
    //         .text(function(d) { return d.name; })
    //         .style("fill-opacity", 1e-6);

    //     // Transition nodes to their new position.
    //     var nodeUpdate = node.transition()
    //         .duration(duration)
    //         .attr("transform", function(d) { return "translate(" + d.y + "," + d.x + ")"; });

    //     nodeUpdate.select("circle")
    //         .attr("r", 4.5)
    //         .style("fill", function(d) { return d._children ? "lightsteelblue" : "#fff"; });

    //     nodeUpdate.select("text")
    //         .style("fill-opacity", 1);

    //     // Transition exiting nodes to the parent's new position.
    //     var nodeExit = node.exit().transition()
    //         .duration(duration)
    //         .attr("transform", function(d) { return "translate(" + source.y + "," + source.x + ")"; })
    //         .remove();

    //     nodeExit.select("circle")
    //         .attr("r", 1e-6);

    //     nodeExit.select("text")
    //         .style("fill-opacity", 1e-6);

    //     // Update the links…
    //     var link = svg.selectAll("path.link")
    //         .data(links, function(d) { return d.target.id; });

    //     // Enter any new links at the parent's previous position.
    //     link.enter().insert("path", "g")
    //         .attr("class", "link")
    //         .attr("d", function(d) {
    //             var o = {x: source.x0, y: source.y0};
    //             return diagonal({source: o, target: o});
    //         });

    //     // Transition links to their new position.
    //     link.transition()
    //         .duration(duration)
    //         .attr("d", diagonal);

    //     // Transition exiting nodes to the parent's new position.
    //     link.exit().transition()
    //         .duration(duration)
    //         .attr("d", function(d) {
    //             var o = {x: source.x, y: source.y};
    //             return diagonal({source: o, target: o});
    //         })
    //         .remove();

    //     // Stash the old positions for transition.
    //     nodes.forEach(function(d) {
    //         d.x0 = d.x;
    //         d.y0 = d.y;
    //     });
    // }

    // return chart;


    // // Toggle children on click.
    // function click(d) {
    //     if (d.children) {
    //         d._children = d.children;
    //         d.children = null;
    //     } else {
    //         d.children = d._children;
    //         d._children = null;
    //     }
    //     update(d);
    // }
}




/*
  phylogram.js
  Wrapper around a d3-based phylogram (tree where branch lengths are scaled)
  Also includes a radial dendrogram visualization (branch lengths not scaled)
  along with some helper methods for building angled-branch trees.

  Copyright (c) 2013, Ken-ichi Ueda
*/
phylogram.rightAngleDiagonal = function() {
    var projection = function(d) {
        return [d.y, d.x];
    }

    var path = function(pathData) {
        return "M" + pathData[0] + ' ' + pathData[1] + " " + pathData[2];
    }

    function diagonal(diagonalPath, i) {
        var source = diagonalPath.source,
            target = diagonalPath.target,
            midpointX = (source.x + target.x) / 2,
            midpointY = (source.y + target.y) / 2,
            pathData = [source, {
                x: target.x,
                y: source.y
            }, target];
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
                radius = Math.sqrt(src[0] * src[0] + src[1] * src[1]),
                srcAngle = phylogram.coordinateToAngle(src, radius),
                midAngle = phylogram.coordinateToAngle(mid, radius),
                clockwise = Math.abs(midAngle - srcAngle) > Math.PI ? midAngle <= srcAngle : midAngle > srcAngle,
                rotation = 0,
                largeArc = 0,
                sweep = clockwise ? 0 : 1;
            return 'M' + src + ' ' +
                "A" + [radius, radius] + ' ' + rotation + ' ' + largeArc + ',' + sweep + ' ' + mid +
                'L' + dst;
        })
        .projection(function(d) {
            var r = d.y,
                a = (d.x - 90) / 180 * Math.PI;
            return [r * Math.cos(a), r * Math.sin(a)];
        })
}

// Convert XY and radius to angle of a circle centered at 0,0
phylogram.coordinateToAngle = function(coord, radius) {
    var wholeAngle = 2 * Math.PI,
        quarterAngle = wholeAngle / 4,
        coordAngle;

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
            coordAngle = 2 * quarterAngle + quarterAngle - coordBaseAngle
            break
        case 4:
            coordAngle = 3 * quarterAngle + coordBaseAngle
    }
    return coordAngle
}

function scaleBranchLengths(nodes, w) {
    // Visit all nodes and adjust y pos width distance metric
    var visitPreOrder = function(root, callback) {
        callback(root)
        if (root.children) {
            for (var i = root.children.length - 1; i >= 0; i--) {
                visitPreOrder(root.children[i], callback)
            };
        }
    }
    visitPreOrder(nodes[0], function(node) {
        node.rootDist = (node.parent ? node.parent.rootDist : 0) + (node.length || 0)
    })
    var rootDists = nodes.map(function(n) {
        return n.rootDist;
    });
    var yscale = d3.scale.pow()
        .exponent(4)
        .nice()
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
        .sort(function(node) {
            return node.children ? node.children.length : -1;
        })
        .children(options.children || function(node) {
            return node.children
        });
    var diagonal = options.diagonal || phylogram.rightAngleDiagonal();
    var vis = options.vis || d3.select(selector).append("svg:svg")
        .attr("width", w + 300)
        .attr("height", h + 30)
        .append("svg:g")
        .attr("transform", "translate(20, 20)");
    console.log("==== Before tree layout =====");
    var nodes = tree(phyloTree);
    console.log("==== After tree layout =====");

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
            .text(function(d) {
                return Math.round(d * 100) / 100;
            });
    }

    const {
        clustersPerSpecies,
        clusterColors
    } = options;

    function diagonalColor(d) {
        const {
            clusters
        } = d.target;
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
        .value(function(d) {
            return d.count;
        });

    const fillColor = (clusterId) => clusterId === 'rest' ? '#eee' : clusterColors[clusterId];

    var clusterData = (d) => {
        if (!d.clusters || d.clusters.totCount === 0)
            return [{
                count: 1
            }];
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
    console.log("==== Phylogram rendered! =====");

    return {
        tree: tree,
        vis: vis
    }
}

phylogram.buildRadial = function(selector, nodes, options) {
    options = options || {}
    var vis = options.vis;
    var w = options.width,
        r = w / 2,
        labelWidth = options.skipLabels ? 10 : options.labelWidth || 120;

    vis.attr("transform", "translate(" + r + "," + r + ")");

    var tree = d3.layout.tree()
        .size([360, r - labelWidth])
        .sort(function(node) {
            return node.children ? node.children.length : -1;
        })
        .children(options.children || function(node) {
            return node.children
        })
        .separation(function(a, b) {
            return (a.parent == b.parent ? 1 : 2) / a.depth;
        });

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
        .attr("transform", function(d) {
            return "rotate(" + (d.x - 90) + ")translate(" + d.y + ")";
        })

    if (!options.skipLabels) {
        vis.selectAll('g.leaf.node text')
            .attr("dx", function(d) {
                return d.x < 180 ? 8 : -8;
            })
            .attr("dy", ".31em")
            .attr("text-anchor", function(d) {
                return d.x < 180 ? "start" : "end";
            })
            .attr("transform", function(d) {
                return d.x < 180 ? null : "rotate(180)";
            })
            .attr('font-family', 'Helvetica Neue, Helvetica, sans-serif')
            .attr('font-size', '10px')
            .attr('fill', 'black')
            .text(d => d.name);

        vis.selectAll('g.inner.node text')
            .attr("dx", function(d) {
                return d.x < 180 ? -6 : 6;
            })
            .attr("text-anchor", function(d) {
                return d.x < 180 ? "end" : "start";
            })
            .attr("transform", function(d) {
                return d.x < 180 ? null : "rotate(180)";
            });
    }

    return {
        tree: tree,
        vis: vis
    }
}




chart.destroy = () => false;