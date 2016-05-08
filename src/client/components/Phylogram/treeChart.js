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

    let maxRootDist = 0;
    treeUtils.visitTreeDepthFirst(phyloTree, (node, depth) => {
        ++numNodes;
        if (node.isLeaf) {
            leafNodes.push(node);
        }
        if (node.rootDist > maxRootDist) {
            maxRootDist = node.rootDist;
        }
    });
    const numLeafNodes = leafNodes.length;

    console.log(`[treeChart], numLeafNodes: ${numLeafNodes}, numNodes: ${numNodes}`);

    if (numLeafNodes === 0) {
        svg.selectAll('*').remove();
        svg.attr("height", 10);
        return;
    }

    const innerDiameter = Math.max(16 * numLeafNodes / Math.PI, 200);
    const labelWidth = 250;
    const outerDiameter = 2 * labelWidth + innerDiameter;
    const R = outerDiameter / 2;
    const r = innerDiameter / 2;
    //   const calculatedWidth = maxDepth * 20;
    //   const calculatedHeight = numNodes * 20;
    //   const calculatedHeight = numLeafNodes * 20;
    
    const allowZoom = true;

    // const s = props.minimap ? 200 / outerDiameter : 1;
    const s = props.minimap ? 200 / outerDiameter : allowZoom ? 1 : 1000 / outerDiameter;
    const width = s * outerDiameter;
    const height = s * outerDiameter;

    const zoom = d3.behavior.zoom()
        .scaleExtent([200 / outerDiameter, 3])
        // .center([s * R, s * R])
        .on("zoom", onZoom);

    svg.selectAll('*').remove();
    
    const g = svg
        .attr("width", width)
        .attr("height", height)
        .append('g');
    
    if (!props.minimap && allowZoom) {
        g.call(zoom);
    }
    
    const vis = g.append('g'); 
    
    // Take zoom events
    vis.append("rect")
        .attr("class", "overlay")
        .attr("width", width)
        .attr("height", height)
        .style("fill", "#ffffff")
        .style("opacity", "0");
    
    const gTree = vis.append("g")
        .attr("transform", `translate(${s * R}, ${s * R})scale(${s})`);
    

    function onZoom() {
        const { translate, scale } = d3.event;
        // console.log(`!!!!!!!! onZoom(), translate: ${translate}, scale: ${scale}`);
        // console.log(`         translate(): ${zoom.translate()}, scale: ${zoom.scale()}`);
        
        vis.attr("transform", `translate(${zoom.translate()})scale(${zoom.scale()})`);
        // vis.attr("transform", `translate(${s * R}, ${s * R})scale(${scale})`);
    }
    // console.log(`!!!! TEST ONCE zoom.* translate(${zoom.translate()})scale(${zoom.scale()})`)
    

    const haveClusters = phyloTree.clusters.clusters.length > 0;
    const haveSpecies = phyloTree.speciesCount > 0;
    const showClusteredNodes = haveClusters && props.showClusteredNodes;
    
    const cluster = d3.layout.cluster()
        .size([360, 1])
        .sort(null)
        .value(d => d.length)
        .separation((a, b) => 1);
        // .separation((a, b) => (a.parent === b.parent ? 1 : 2) / a.depth );
    
    const nodes = cluster.nodes(phyloTree);
    
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
    
    const linkColor = showClusteredNodes ? clusterLinkColor : nonClusterLinkColor;
    
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
    
    const nodeStrokeColor = showClusteredNodes ? pieStrokeColor : circleArcStrokeColor;
    const nodeFillColor = showClusteredNodes ? pieFillColor : circleArcFillColor;
    
    
    var clusterData = (d) => {
        if (!d.clusters || d.clusters.totCount === 0)
            return [{
                count: 1
            }];
        return d.clusters.clusters;
    };
    
    var radialAxis = gTree.selectAll(".axis")
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


    var link = gTree.selectAll("path.link")
        .data(cluster.links(nodes))
       .enter().append("path")
        .attr("class", "link")
        .attr("fill", "none")
        .attr("stroke", d => linkColor(d.target))
        .attr("stroke-width", "4px")
        .attr("d", step);

    var node = gTree.selectAll("g.node")
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
    const arcData = showClusteredNodes ? clusterArcData : circleArcData;

    console.log(`[treeChart]: render nodes...`)
    const pies = node.selectAll(".pie")
        .data(arcData);

    pies.enter().append("path")
        .attr("class", "pie")

    pies.exit().remove();

    pies.attr("d", arc)
        .style("stroke", nodeStrokeColor)
        .style("fill", nodeFillColor);
    


    var label = gTree.selectAll(".label")
        .data(leafNodes)
      .enter().append("text")
        .attr("class", "label")
        .attr("dy", ".31em")
        .attr("text-anchor", d => d.x < 180 ? "start" : "end")
        .attr("transform", d => {
            return "rotate(" + (d.x - 90) + ")translate(" + (r) + ")rotate(" + (d.x < 180 ? 0 : 180) + ")";
        })
        .attr("fill", linkColor)
        .attr("stroke", "none")
        .attr("font-family", "'Open Sans', Helvetica, sans-serif")
        .text(d => d.name);

}

chart.destroy = () => false;
