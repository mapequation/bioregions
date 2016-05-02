import $ from 'jquery'
import d3 from 'd3'
import chroma from 'chroma-js';
import treeUtils from '../../utils/treeUtils';
import _ from 'lodash';

const chart = {};
export default chart;

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
    treeUtils.visitTreeDepthFirst(phyloTree, (node, depth) => {
        ++numNodes;
        if (node.isLeaf) {
            leafNodes.push(node);
        }
    });
    const numLeafNodes = leafNodes.length;

    console.log(`[treeChart], numLeafNodes: ${numLeafNodes}, numNodes: ${numNodes}`);

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
    
    const vis = g;
    const s = props.minimap ? 200 / outerDiameter : 1;

    svg.attr("width", s * outerDiameter)
        .attr("height", s * outerDiameter);

    vis.attr("transform", `translate(${s * R}, ${s * R})scale(${s})`);
    
    function onZoom() {
        vis.attr("transform", `translate(${d3.event.translate})scale(${d3.event.scale})`);
    }

    if (!props.minimap) {
        // const zoomListener = d3.behavior.zoom()
        // .scaleExtent([0.1, 3]).on("zoom", onZoom);
        // vis.call(zoomListener);
    }

    const haveClusters = phyloTree.clusters.clusters.length > 0;
    const haveSpecies = phyloTree.speciesCount > 0;

    const cluster = d3.layout.cluster()
        .size([360, 1])
        .sort(null)
        .value(d => d.length)
        .separation((a, b) => 1);
        // .separation((a, b) => (a.parent === b.parent ? 1 : 2) / a.depth );
    
    const nodes = cluster.nodes(phyloTree);

    let maxRootDist = 0;
    nodes.forEach(node => {
        node.rootDist = (node.parent ? node.parent.rootDist : 0) + (node.length || 0);
        if (node.isLeaf && node.rootDist > maxRootDist) {
            maxRootDist = node.rootDist;
        }
    });
    
    const yscale = d3.scale.pow()
        .exponent(4)
        .nice()
        .domain([0, maxRootDist])
        .range([0, r - 20]);
    
    nodes.forEach(node => { node.y = yscale(node.rootDist); });

    function project(d) {
        let r = d.y,
            a = (d.x - 90) / 180 * Math.PI;
        return [r * Math.cos(a), r * Math.sin(a)];
    }
    
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
    
    const scaleColors = ['yellow', 'red', 'black'].map(c => chroma(c).desaturate(2));
    const fillColorByOccurrence = chroma.scale(scaleColors).mode('lab')
        .domain([0, Math.log(phyloTree.occurrenceCount || 1)])
        .padding([0.3, 0.2]);
    const fillColorByLeafCount = chroma.scale(scaleColors).mode('lab')
        .domain([0, Math.log(phyloTree.leafCount)])
        .padding([0.3, 0.2]);
    const circleFillColorScale = haveSpecies ? fillColorByOccurrence : fillColorByLeafCount;
    const fillField = haveSpecies ? 'occurrenceCount' : 'leafCount';

    const circleFillColor = (d) => circleFillColorScale(Math.log(d[fillField])).hex();
    
    const clusterLinkColor = (d) => d.clusters.clusters.length === 0 ?
        '#aaa' : clusterColors[d.clusters.clusters[0].clusterId];
    
    const nonClusterLinkColor = (d) => circleFillColorScale(Math.log(d[fillField])).hex();
    
    const linkColor = haveClusters ? clusterLinkColor : nonClusterLinkColor;
    
    const fillColor = (clusterId) => {
        if (clusterId >= 0)
            return clusterColors[clusterId];
        if (clusterId === 'rest')
            return '#eee';
        return 'white';
    }
    
    const pieStrokeColor = (d) => d.data.clusterId !== undefined ? "white" : "grey";
    const pieFillColor = (d) => d.data.clusterId !== undefined ? fillColor(d.data.clusterId) : "white";
    const circleArcStrokeColor = (d) => 'white';
    const circleArcFillColor = (d) => circleFillColor(d.data);
    
    const nodeStrokeColor = haveClusters ? pieStrokeColor : circleArcStrokeColor;
    const nodeFillColor = haveClusters ? pieFillColor : circleArcFillColor;
    
    
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
        .attr("stroke", d => linkColor(d.target))
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
    
    const clusterArcData = d => pie(clusterData(d));
    const circleArcData = d => [{ startAngle: 0, endAngle: 2 * Math.PI, data: d }];
    const arcData = haveClusters ? clusterArcData : circleArcData;

    const pies = node.selectAll(".pie")
        .data(arcData);

    pies.enter().append("path")
        .attr("class", "pie")

    pies.exit().remove();

    pies.attr("d", arc)
        .style("stroke", nodeStrokeColor)
        .style("fill", nodeFillColor);
    


    var label = vis.selectAll(".label")
        .data(leafNodes)
      .enter().append("text")
        .attr("class", "label")
        .attr("dy", ".31em")
        .attr("text-anchor", d => d.x < 180 ? "start" : "end")
        .attr("transform", d => {
            return "rotate(" + (d.x - 90) + ")translate(" + (r) + ")rotate(" + (d.x < 180 ? 0 : 180) + ")";
        })
        .attr("fill", linkColor)
        .attr("stroke", linkColor)
        .attr("font-family", "'Open Sans', Helvetica, sans-serif")
        .text(d => d.name);

}

chart.destroy = () => false;
