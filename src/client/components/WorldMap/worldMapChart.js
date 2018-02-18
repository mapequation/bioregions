import $ from 'jquery'
import d3 from 'd3'
import * as topojson from 'topojson'
import colorbrewer from 'colorbrewer'
import chroma from 'chroma-js';
import {DATA_SUCCEEDED} from '../../constants/DataFetching'
import {BY_NAME, BY_CLUSTER} from '../../constants/Display';
var world = {};

export default world;

world.create = function(el, props) {
  console.log("!!!! world.create()");
  var anchorElement = d3.select(el);
  anchorElement.selectAll("*").remove();
  var svg = anchorElement.append('svg')
    .attr('width', props.width)
    .attr('height', props.height)
    .attr('id', "worldmap")
    .attr('class', "worldmap");

  var g = svg.append("g");

  g.append("use")
    .attr("xlink:href", "#land");

  var defs = g.append("defs");

  g.append("path")
    .attr("id", "land")
    .attr("class", "land");

  var overlayGroup = g.append("g")
    .attr("class", "overlay")
    .attr("clip-path", "url(#clip)");

  var graticuleGroup = g.append("g")
    .attr("class", "graticules");
  graticuleGroup.append("path")
    .attr("class", "graticule");
  graticuleGroup.append("path")
    .attr("class", "graticule-outline");

  // var defsPath = defs.append("path")
  //   .attr("id", "land")
  //   .attr("class", "land")

  defs.append("clipPath")
    .attr("id", "clip")
    .append("use")
    .attr("xlink:href", "#land");

  return world.update(el, props);
}

world.update = function(el, props) {
  console.log("!!!! world.update()");
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

  var height = props.height - props.top - props.bottom;
  var width = totalWidth - props.left - props.right;

  console.log(`--> totalWidth: ${totalWidth}, width: ${width}`);

  svg.attr("width", totalWidth)
    .attr("height", props.height);

  g.attr("transform", `translate(${props.left}, ${props.top})`);

  console.log("Creating worldmap zoom behavior...");
  let zoom = d3.behavior.zoom()
    .scaleExtent([1, 12])
    .on("zoom", onZoom);

  svg.call(zoom)
    .on("click", onClick);

  world._zoomTranslation = [0, 0];
  world._zoomScale = 1;

  doZoom(world._zoomTranslation, world._zoomScale);

  props.projection
    .translate([width/2, height/2])
    .scale(width / 2 / Math.PI);

  var path = d3.geo.path()
    .pointRadius(1)
    .projection(props.projection);

  var landPath = g.select("path.land");
  if (props.worldStatus === DATA_SUCCEEDED) {
    console.log("Draw world...");
    landPath
      .datum(topojson.feature(props.world, props.world.objects.land))
      .attr("d", path);
  }
  landPath
    .style("fill", "white")
    .style("stroke", "#666");

  const {graticuleStep, showGraticules} = props;
  var graticule = d3.geo.graticule()
    .step([graticuleStep, graticuleStep]);

  let emptyGraticule = () => [];
  emptyGraticule.outline = () => [];

  if (!showGraticules)
    graticule = emptyGraticule;

  g.select(".graticules").select("path.graticule")
    .datum(graticule)
      .attr("d", path)
      .attr("fill", "none")
      .attr("stroke", "#ccc")
      .attr("stroke-opacity", 0.3)
      .attr("stroke-width", ".5px");
  g.select(".graticules").select("path.graticule-outline")
    .datum(graticule.outline)
      .attr("d", path)
      .attr("fill", "none")
      .attr("stroke", "#ccc")
      .attr("stroke-opacity", 0.3)
      .attr("stroke-width", ".5px");


  function drawRawFeatures() {
    let rawLimit = 100;
    console.log(`Draw ${rawLimit}/${props.features.length} raw feature...`);
    let testFeatures = props.features.slice(0, rawLimit);
    let svgFeature = g.select(".overlay").selectAll("path").data(testFeatures);
    svgFeature.exit().remove();
    svgFeature.enter().append("path").attr("class", "feature");
    svgFeature.attr("d", path)
      .style("fill", "none")
      .style("stroke", "red");
  }


  function getClusterColor(clusterId) {
    let clusterColor = props.clusterColors[clusterId];
    if (props.selectedCluster >= 0)
      return clusterId === props.selectedCluster? clusterColor : chroma(clusterColor.hex()).alpha(0.2);
    return clusterColor;
  }

  if (props.bins.length > 0) {
    var colorDomainValue;
    var color;
    if (props.mapBy == BY_CLUSTER) {
      colorDomainValue = (d) => d.clusterId;
      color = (clusterId) => getClusterColor(clusterId).css();
    }
    else {
      const bins = props.bins;
      let maxCount = d3.max(bins.map((bin) => bin.count / bin.area));
      let domainMax = + maxCount + (8 - maxCount % 8);
      let domain = d3.range(0, domainMax, (domainMax)/8); // Exact doesn't include the end for some reason
      domain.push(domainMax);
      domain[0] = 1; // Make a threshold between non-empty and empty bins
      domain.unshift(0.5);
      console.log("Color domain:", domain.length, domain);

      let colorRange = colorbrewer.YlOrRd[9].slice(0, 9); // don't change original
      colorRange.unshift("#eeeeee");
      color = d3.scale.threshold()
        .domain(domain)
        .range(colorRange);

      colorDomainValue = (d) => d.count / d.area;
    }

    let binPaths = g.select(".overlay")
      .attr("clip-path", props.clipToLand? "url(#clip)" : null)
      .selectAll(".bin")
        .data(props.bins);

    binPaths.exit().remove();

    binPaths.enter().append("path")
      .attr("class", "bin")
      .on('mouseover', props.onMouseOver)
      .on('mouseout', props.onMouseOut)
      .on('click', props.onMouseClick);

    //Update
    binPaths.attr("d", props.binning.renderer(props.projection))
      .style("fill", (d, i) => color(colorDomainValue(d)))
      .style("stroke", props.showCellBorders? "#ccc" : "none")
      // .style("stroke", (d, i) => color(colorDomainValue(d)))
      .style("stroke-opacity", 0.5)
      .style("stroke-width", 0.1)
      .style("shape-rendering", "crispEdges"); // Needed in chrome to not show stroke artefacts
      // .style("stroke", "white")
  }
  else {
    // No bins, remove possible existing ones
    let binPaths = g.select(".overlay")
      .selectAll(".bin")
        .data(props.bins);

    binPaths.exit().remove();
  }

  function onZoom() {
    if (!props.world)
      return;

    var t = d3.event.translate;
    var s = d3.event.scale;
    var h = height/4;

    t[0] = Math.min(
      (width/height)  * (s - 1),
      Math.max(width * (1 - s), t[0])
    );

    t[1] = Math.min(
      h * (s - 1) + h * s,
      Math.max(height  * (1 - s) - h * s, t[1])
    );

    doZoom(t, s);
  }

  function doZoom(translation, scale) {
    // Cache current zoom
    world._zoomTranslation = translation;
    world._zoomScale = scale;
    // console.log(`doZoom: t: ${translation}, s: ${scale}`);

    zoom.translate(translation);
    g.attr("transform", "translate(" + translation + ")scale(" + scale + ")");

    //adjust the country hover stroke width based on zoom level
    g.select("#land").style("stroke-width", 1.5 / scale);
    // g.selectAll(".quadnode").style("stroke-width", 1.0 / s);
    g.selectAll(".graticules").select("path").style("stroke-width", 0.5 / scale);
    // g.selectAll(".bins").style("stroke-width", 0.5 / scale);
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
