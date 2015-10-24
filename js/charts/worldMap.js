import $ from 'jquery'
import d3 from 'd3'
import topojson from 'topojson'
import QuadtreeBinner from '../utils/QuadtreeBinner'
import colorbrewer from 'colorbrewer'

var world = {};

export default world;

world.topology = undefined;

world.create = function(el, props) {
  console.log("world.create()");
  var anchorElement = d3.select(el);
  anchorElement.selectAll("*").remove();
  var svg = anchorElement.append('svg')
    .attr('class', 'd3')
    .attr('width', props.width)
    .attr('height', props.height);

  var g = svg.append("g");

  g.append("use")
    .attr("xlink:href", "#land");

  var defs = g.append("defs");

  var overlayGroup = g.append("g")
    .attr("class", "overlay")
    .attr("clip-path", "url(#clip)");

  var defsPath = defs.append("path")
    .attr("id", "land")
    .attr("class", "land")

  defs.append("clipPath")
    .attr("id", "clip")
    .append("use")
    .attr("xlink:href", "#land");

  world.update(el, props);
}

world.update = function(el, props) {
  console.log("world.update()");
  props = Object.assign({
    autoResize: true,
    width: null, // null to set it to the width of the anchor element
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    height: 500,
    projection: d3.geo.mercator(),
  }, props);

  var anchorElement = d3.select(el);
  var svg = anchorElement.select("svg");
  if (svg.empty()) {
    console.log("Update map without created svg, calling create...");
    world.create(el, props);
    return;
  }

  var g = svg.select("g");


  var totalWidth = props.width;
  if (!totalWidth)
    totalWidth = $(anchorElement.node()).innerWidth();

  var zoom = d3.behavior.zoom()
    .scaleExtent([1, 12])
    .on("zoom", onZoom);


  var path = d3.geo.path()
    .pointRadius(1)
    .projection(props.projection);

  svg.call(zoom)
    .on("click", onClick);

  var isLoadingWorld = false;

  console.log("render world chart...");

  var height = props.height - props.top - props.bottom;
  var width = totalWidth - props.left - props.right;

  svg.attr("width", totalWidth)
    .attr("height", props.height);

  g.attr("transform", `translate(${props.left}, ${props.top})`);

  props.projection
    .translate([(width/2), (height/2)])
    .scale( width / 2 / Math.PI);

  drawWorld();

  function drawWorld() {

    if (!world.topology) {
      loadWorld();
      return;
    }

    var defsPath = g.select("defs").select("path");
    if (!defsPath.datum()) {
      console.log("Render world...");
      defsPath
        .datum(topojson.feature(world.topology, world.topology.objects.land))
        .attr("d", path);
    }

    console.log("Draw features...");
    let testFeatures = props.features.slice(0);


    // let svgFeature = g.select(".overlay").selectAll("path").data(testFeatures);
    // svgFeature.exit().remove();
    // svgFeature.enter().append("path").attr("class", "feature");
    // svgFeature.attr("d", path)
    //   .style("fill", "none")
    //   .style("stroke", "red");

    // draw quadtree
    let quadtree = new QuadtreeBinner()
      .x((point) => point.geometry.coordinates[0])
      .y((point) => point.geometry.coordinates[1])
      .extent([[-180, -90], [180, 90]])
      .minNodeSize(1);

    quadtree.addPoints(testFeatures);

    let bins = quadtree.bins();

    var maxCount = d3.max(bins.map((feature) => feature.properties.points.length));
    var domainMax = + maxCount + (8 - maxCount % 8);
    console.log("domainMax:", domainMax);
    var domain = d3.range(0, domainMax, (domainMax)/8); // Exact doesn't include the end for some reason
    domain.push(domainMax);
    domain[0] = 1; // Make a threshold between non-empty and empty bins
    domain.unshift(0.5);
    console.log("Color domain:", domain.length, domain);

    var colorRange = colorbrewer.YlOrRd[9].slice(0, 9); // don't change original
    colorRange.unshift("#eeeeee");
    console.log("Color range:", colorRange.length, colorRange);
    var color = d3.scale.threshold()
        .domain(domain)
        .range(colorRange);

    // console.log("quad nodes:", quadtree.bins());
    var quadNodes = g.select(".overlay").selectAll(".quadnode")
        .data(bins);
    quadNodes.exit().remove();
    quadNodes.enter().append("path").attr("class", "quadnode");
    quadNodes.attr("d", quadtree.renderer(props.projection))
      .style("fill", (d) => color(d.points.length))
      .style("stroke", "#ccc");

  }

  function loadWorld() {
    if (isLoadingWorld)
      return;
    isLoadingWorld = true;
    console.log("Load world map...");

    var progress = svg.append("text")
    .attr("class", "progress")
    .attr("font-size", 14)
    .style("fill", "white")
    .attr("x", width/2)
    .attr("y", height/2)
    .attr("text-anchor", "middle");
    // .text("Loding world map...");


    d3.json("maps/physical/land.topojson", function (error, topology) {
      if (error) {
        console.log("Error loading world:", error);
        progress.text("Error loading world: " + error.statusText);
        anchorElement.classed("error", true);
        return;
      }
      world.topology = topology;
      progress.remove();
      //svg.classed("world-loaded", true);
      anchorElement.classed("world-loaded", true);
      console.log("Loaded world topology!");
      drawWorld();
    });
  }

  function onZoom() {
    if (!world.topology)
    return;

    var t = d3.event.translate;
    var s = d3.event.scale;
    var h = height/4;

    t[0] = Math.min(
      (width/height)  * (s - 1),
      Math.max( width * (1 - s), t[0] )
    );

    t[1] = Math.min(
      h * (s - 1) + h * s,
      Math.max(height  * (1 - s) - h * s, t[1])
    );

    zoom.translate(t);
    g.attr("transform", "translate(" + t + ")scale(" + s + ")");

    //adjust the country hover stroke width based on zoom level
    g.select("#land").style("stroke-width", 1.5 / s);
    // g.selectAll(".quadnode").style("stroke-width", 1.0 / s);

  }

  //geo translation on mouse click in map
  function onClick() {
    var lonlat = props.projection.invert(d3.mouse(this));
    console.log("Long, Lat:", lonlat);
  }

  function getSize(selection) {
    // D3 to jQuery
    var $container = $(selection.node());
    return [$container.innerWidth(), $container.innerHeight()];
  }

  function onResize() {

    if (props.width)
    return;

    var w = $(anchorElement.node()).innerWidth();

    if (w === totalWidth)
    return;

    world.render();
  }

  function onChangeClipOverlay(clip) {
    overlayGroup.attr("clip-path", clip? "url(#clip)" : null);
  }

  return world;
}

world.destroy = function(el) {
  console.log("worldMap::destroy()");
}
