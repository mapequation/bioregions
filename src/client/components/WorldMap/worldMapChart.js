import $ from 'jquery';
import d3 from 'd3';
import * as topojson from 'topojson';
import colorbrewer from 'colorbrewer';
import chroma from 'chroma-js';
import {DATA_SUCCEEDED} from '../../constants/DataFetching';
import { BY_CLUSTER } from '../../constants/Display';

const world = {};

export default world;

world.create = function(el, props) {
  // console.log("Create world map chart...");
  world._zoomTranslation = [0, 0];
  world._zoomScale = 1;

  const anchorElement = d3.select(el);
  anchorElement.selectAll("*").remove();
  const svg = anchorElement.append('svg')
    .attr('width', props.width)
    .attr('height', props.height)
    .attr('id', "worldmap")
    .attr('class', "worldmap");

  const g = svg.append("g");

  g.append("use")
    .attr("xlink:href", "#land");

  const defs = g.append("defs");

  g.append("path")
    .attr("id", "land")
    .attr("class", "land");

  const overlayGroup = g.append("g")
    .attr("class", "overlay")
    .attr("clip-path", "url(#clip)");

  const graticuleGroup = g.append("g")
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
};

world.update = function(el, properties) {
  // console.log("Update world map chart...", properties);
  const props = Object.assign({
    autoResize: true,
    width: null, // null to set it to the width of the anchor element
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    height: 500,
    projection: d3.geo.mercator(),
  }, properties);

  const anchorElement = d3.select(el);
  const svg = anchorElement.select("svg");
  if (svg.empty()) {
    console.log("Update map without created svg, calling create...");
    world.create(el, props);
    return;
  }

  const g = svg.select("g");

  let totalWidth = props.width;
  if (!totalWidth) {
    totalWidth = $(anchorElement.node()).innerWidth();
  }

  const height = props.height - props.top - props.bottom;
  const width = totalWidth - props.left - props.right;

  // console.log(`--> totalWidth: ${totalWidth}, width: ${width}`);

  svg.attr("width", totalWidth)
    .attr("height", props.height);

  g.attr("transform", `translate(${props.left}, ${props.top})`);

  // console.log("Creating worldmap zoom behavior...");
  const zoom = d3.behavior.zoom()
    .scaleExtent([1, 12])
    .on("zoom", onZoom);

  svg.call(zoom)
    .on("click", onClick);

  doZoom(world._zoomTranslation || [0, 0], world._zoomScale || 1);

  props.projection
    .translate([width / 2, height / 2])
    .scale(width / 2 / Math.PI);

  const path = d3.geo.path()
    .pointRadius(1)
    .projection(props.projection);

  const landPath = g.select("path.land");
  if (props.worldStatus === DATA_SUCCEEDED) {
    // console.log("Draw world...");
    landPath
      .datum(topojson.feature(props.world, props.world.objects.land))
      .attr("d", path);
  }
  landPath
    .style("fill", "white")
    .style("stroke", "#666");

  const {graticuleStep, showGraticules} = props;
  let graticule = d3.geo.graticule()
    .step([graticuleStep, graticuleStep]);

  const emptyGraticule = () => [];
  emptyGraticule.outline = () => [];

  if (!showGraticules) {
    graticule = emptyGraticule;
  }

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



  if (props.bins.length > 0) {
    let color;

    const ordinaryStrokeColor = d => {
      return props.showCellBorders ? "#ccc" : "none";
    };

    const selectedStrokeColor = (d) => {
      if (d === props.selectedCell) {
        return "#c00";
      }
      return ordinaryStrokeColor(d);
    };

    const strokeColor = props.selectedCell ? selectedStrokeColor : ordinaryStrokeColor;

    const strokeOpacity = (d) => (props.selectedCell && props.selectedCell === d) ? 1.0 : 0.5;

    const strokeWidth = (d) => (props.selectedCell && props.selectedCell === d) ? 0.2 : 0.1;

    const selectedCellMax = props.selectedCell ?
    props.selectedCell.links.get(props.selectedCell.binId) : 1.0;
    const selectedCellAlphaScale = d3.scale.linear().domain([0, selectedCellMax]).range([0.2, 1]);


    const getClusterColor = (d) => {
      const clusterColor = props.clusterColors[d.clusterId];
      if (props.selectedClusterId >= 0) {
        return d.clusterId === props.selectedClusterId ? clusterColor.css() : chroma(clusterColor.hex()).alpha(0.2).css();
      }
      else if (props.selectedCell) {
        const similarity = props.selectedCell.links.get(d.binId);
        if (!similarity) {
          return "#eeeeee";
        }
        const alpha = selectedCellAlphaScale(similarity);
        return chroma(clusterColor.hex()).alpha(alpha).css();
      }
      return clusterColor.css();
    };

    if (props.mapBy === BY_CLUSTER) {
      color = (d) => getClusterColor(d);
    } else {
      const bins = props.bins;
      const domainExtent = d3.extent(bins.map((bin) => bin.count / bin.area));
      // const maxCount = d3.max(bins.map((bin) => bin.count / bin.area));
      // const [domainMin, domainMax] = domainExtent;
      const domainMax = domainExtent[1];
      // const domainMax = + maxCount + (8 - maxCount % 8);
      // const domainMax = maxCount;
      const domain = d3.range(0, domainMax, (domainMax) / 8); // Exact doesn't include the end for some reason
      domain.push(domainMax);
      // domain[0] = 1; // Make a threshold between non-empty and empty bins
      // domain.unshift(0.5);
      // console.log("Color domain:", domain.length, domain);
      const colorDomainValue = d => d.count / d.area;

      const colorRange = colorbrewer.YlOrRd[9].slice(0, 9); // don't change original
      // colorRange.unshift("#eeeeee");
      // const heatmapColor = d3.scale.threshold()
      //   .domain(domain)
      //   .range(colorRange);
      // asdf
      const heatmapColorScale = d3.scale.log()
        .domain(domainExtent)
        .range([0, 8]);
      const heatmapColor = (d) => {
        return colorRange[Math.floor(heatmapColorScale(d))];
      };

      const linkColors = colorbrewer.Blues["9"];
      const selectedCellColorScale = d3.scale.linear()
        .domain([0, selectedCellMax]).range([0, 8]);

      const selectedCellColor = (d) => {
        const similarity = props.selectedCell.links.get(d.binId);
        if (!similarity) {
          return '#eeeeee';
        }
        return linkColors[Math.floor(selectedCellColorScale(similarity))];

        // const alpha = alphaScale(similarity);
        // if (similarity)
          // console.log(`${props.selectedCell.binId} -> ${d.binId}: similarity: ${similarity} -> alpha: ${alpha}`);
        // return chroma(heatmapColor(colorDomainValue(d))).alpha(alpha).css();
      };
      // const ordinaryCellColor = (d) => heatmapColor(d.count / d.area);
      const ordinaryCellColor = (d) => {
        const c = heatmapColor(colorDomainValue(d));
        d.color = c;
        return c;
      };

      color = props.selectedCell ? selectedCellColor : ordinaryCellColor;
    }

    const binPaths = g.select(".overlay")
      .attr("clip-path", props.clipToLand ? "url(#clip)" : null)
      .selectAll(".bin")
        .data(props.bins);

    binPaths.exit().remove();

    binPaths.enter().append("path")
      .attr("class", "bin")
      .on('mouseover', onMouseOverGridCell)
      .on('mouseout', onMouseOutGridCell)
      .on('click', onClickGridCell);

    //Update
    binPaths.attr("d", props.binning.renderer(props.projection))
      .style("fill", color)
      .style("stroke", strokeColor)
      // .style("stroke", (d, i) => color(colorDomainValue(d)))
      .style("stroke-opacity", strokeOpacity)
      .style("stroke-width", strokeWidth)
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
    if (!props.world) {
      return;
    }

    const t = d3.event.translate;
    const s = d3.event.scale;
    const h = height / 4;
    // console.log('d3.event t:', t, 's:', s);

    t[0] = Math.min(
      (width / height)  * (s - 1),
      Math.max(width * (1 - s), t[0])
    );

    t[1] = Math.min(
      h * (s - 1) + h * s,
      Math.max(height  * (1 - s) - h * s, t[1])
    );

    doZoom(t, s);
    // props.onZoom({ translation: t, scale: s });
  }

  function doZoom(translation, scale) {
    // Cache current zoom
    world._zoomTranslation = translation;
    world._zoomScale = scale;
    // console.log(`doZoom: t: ${translation}, s: ${scale}`);

    zoom.translate(translation);
    zoom.scale(scale);
    g.attr("transform", "translate(" + translation + ")scale(" + scale + ")");

    //adjust the country hover stroke width based on zoom level
    g.select("#land").style("stroke-width", 1.5 / scale);
    // g.selectAll(".quadnode").style("stroke-width", 1.0 / s);
    g.selectAll(".graticules").select("path").style("stroke-width", 0.5 / scale);
    // g.selectAll(".bins").style("stroke-width", 0.5 / scale);
  }

  function onClickGridCell(d) {
    console.log('####### mouse CLICK', d);
    d3.event.stopPropagation();
    d3.event.preventDefault();
    console.log('props:', props);
    props.onMouseClick(d);
  }

  function onMouseOverGridCell(d) {
    // console.log('####### mouse OVER', d);
    d3.event.stopPropagation();
    d3.event.preventDefault();
    props.onMouseOver(d);
  }

  function onMouseOutGridCell(d) {
    // console.log('####### mouse OUT', d);
    d3.event.stopPropagation();
    d3.event.preventDefault();
    props.onMouseOut(d);
  }

  //geo translation on mouse click in map
  function onClick() {
    var lonlat = props.projection.invert(d3.mouse(this));
    console.log("Long, Lat:", lonlat);
    props.onMouseClick(null);
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
