import * as d3 from 'd3';

var demo = {};
demo.canvas = function () {
  'use strict';

  var _width = 400,
    _height = 450,
    zoomEnabled = true,
    dragEnabled = true,
    scale = 1,
    translation = [0, 0],
    base = null,
    wrapperBorder = 2,
    minimap = null,
    minimapPadding = 20,
    minimapScale = 0.25,
    nodes = [],
    circles = [];

  function canvas(selection) {
    base = selection;

    var xScale = d3
      .scaleLinear()
      .domain([-_width / 2, _width / 2])
      .range([0, _width]);

    var yScale = d3
      .scaleLinear()
      .domain([-_height / 2, _height / 2])
      .range([_height, 0]);

    var zoomHandler = function (newScale) {
      if (!zoomEnabled) {
        return;
      }
      if (d3.event) {
        scale = d3.event.scale;
      } else {
        scale = newScale;
      }
      if (dragEnabled) {
        var tbound = -_height * scale,
          bbound = _height * scale,
          lbound = -_width * scale,
          rbound = _width * scale;
        // limit translation to thresholds
        translation = d3.event ? d3.event.translate : [0, 0];
        translation = [
          Math.max(Math.min(translation[0], rbound), lbound),
          Math.max(Math.min(translation[1], bbound), tbound),
        ];
      }

      d3.select('.panCanvas, .panCanvas .bg').attr(
        'transform',
        'translate(' + translation + ')' + ' scale(' + scale + ')',
      );

      minimap.scale(scale).render();
    }; // startoff zoomed in a bit to show pan/zoom rectangle

    var zoom = d3.behavior
      .zoom()
      .x(xScale)
      .y(yScale)
      .scaleExtent([0.5, 5])
      .on('zoom.canvas', zoomHandler);

    var svg = selection
      .append('svg')
      .attr('class', 'svg canvas')
      .attr(
        'width',
        _width + wrapperBorder * 2 + minimapPadding * 2 + _width * minimapScale,
      )
      .attr('height', _height + wrapperBorder * 2 + minimapPadding * 2)
      .attr('shape-rendering', 'auto');

    var svgDefs = svg.append('defs');

    svgDefs
      .append('clipPath')
      .attr('id', 'wrapperClipPathDemo01_cwbjo')
      .attr('class', 'wrapper clipPath')
      .append('rect')
      .attr('class', 'background')
      .attr('width', _width)
      .attr('height', _height);

    svgDefs
      .append('clipPath')
      .attr('id', 'minimapClipPath_cwbjo')
      //.attr("class", "minimap clipPath")
      .attr('width', _width)
      .attr('height', _height)
      .attr(
        'transform',
        'translate(' +
          (_width + minimapPadding) +
          ',' +
          minimapPadding / 2 +
          ')',
      )
      .append('rect')
      .attr('class', 'background')
      .attr('width', _width)
      .attr('height', _height);

    var filter = svgDefs
      .append('svg:filter')
      .attr('id', 'minimapDropShadow_cwbjo')
      .attr('x', '-20%')
      .attr('y', '-20%')
      .attr('width', '150%')
      .attr('height', '150%');

    filter
      .append('svg:feOffset')
      .attr('result', 'offOut')
      .attr('in', 'SourceGraphic')
      .attr('dx', '1')
      .attr('dy', '1');

    filter
      .append('svg:feColorMatrix')
      .attr('result', 'matrixOut')
      .attr('in', 'offOut')
      .attr('type', 'matrix')
      .attr('values', '0.1 0 0 0 0 0 0.1 0 0 0 0 0 0.1 0 0 0 0 0 0.5 0');

    filter
      .append('svg:feGaussianBlur')
      .attr('result', 'blurOut')
      .attr('in', 'matrixOut')
      .attr('stdDeviation', '10');

    filter
      .append('svg:feBlend')
      .attr('in', 'SourceGraphic')
      .attr('in2', 'blurOut')
      .attr('mode', 'normal');

    var minimapRadialFill = svgDefs.append('radialGradient').attr({
      id: 'minimapGradient_cwbjo',
      gradientUnits: 'userSpaceOnUse',
      cx: '500',
      cy: '500',
      r: '400',
      fx: '500',
      fy: '500',
    });
    minimapRadialFill
      .append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#FFFFFF');
    minimapRadialFill
      .append('stop')
      .attr('offset', '40%')
      .attr('stop-color', '#EEEEEE');
    minimapRadialFill
      .append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#E0E0E0');

    var outerWrapper = svg
      .append('g')
      .attr('class', 'wrapper outer')
      .attr('transform', 'translate(0, ' + minimapPadding + ')');

    outerWrapper
      .append('rect')
      .attr('class', 'background')
      .attr('width', _width + wrapperBorder * 2)
      .attr('height', _height + wrapperBorder * 2);

    var innerWrapper = outerWrapper
      .append('g')
      .attr('class', 'wrapper inner')
      .attr('clip-path', 'url(#wrapperClipPathDemo01_cwbjo)')
      .attr(
        'transform',
        'translate(' + wrapperBorder + ',' + wrapperBorder + ')',
      )
      .call(zoom);

    innerWrapper
      .append('rect')
      .attr('class', 'background')
      .attr('width', _width)
      .attr('height', _height);

    var panCanvas = innerWrapper
      .append('g')
      .attr('class', 'panCanvas')
      .attr('width', _width)
      .attr('height', _height)
      .attr('transform', 'translate(0,0)');

    panCanvas
      .append('rect')
      .attr('class', 'background')
      .attr('width', _width)
      .attr('height', _height);

    minimap = d3.demo
      .minimap()
      .zoom(zoom)
      .target(panCanvas)
      .minimapScale(minimapScale)
      .x(_width + minimapPadding)
      .y(minimapPadding);

    svg.call(minimap);

    // startoff zoomed in a bit to show pan/zoom rectangle
    zoom.scale(1.5);
    zoomHandler(1.5);

    /** ADD SHAPE **/
    canvas.addItem = function (item) {
      panCanvas.node().appendChild(item.node());
      minimap.render();
    };

    canvas.loadTree = function () {
      var diameter = 400;

      var tree = d3
        .tree()
        .size([diameter, diameter])
        .separation(function (a, b) {
          return (a.parent == b.parent ? 1 : 2) / a.depth;
        });

      var diagonal = d3.linkRadial().projection(function (d) {
        return [d.y, (d.x / 180) * Math.PI];
      });

      var treeCanvas = panCanvas
        .append('g')
        .classed('radialtree', true)
        .attr('width', diameter)
        .attr('height', diameter)
        .attr(
          'transform',
          'translate(' + diameter / 2 + ',' + diameter / 2 + ')scale(.4)',
        );

      d3.json(
        'http://www.billdwhite.com/wordpress/wp-content/data/flare.json',
        function (error, root) {
          var nodes = tree.nodes(root),
            links = tree.links(nodes);

          var link = treeCanvas
            .selectAll('.link')
            .data(links)
            .enter()
            .append('path')
            .attr('class', 'link')
            .attr('d', diagonal);

          var node = treeCanvas
            .selectAll('.node')
            .data(nodes)
            .enter()
            .append('g')
            .attr('class', 'node')
            .attr('transform', function (d) {
              return 'rotate(' + (d.x - 90) + ')translate(' + d.y + ')';
            });

          node.append('circle').attr('r', 0.5);

          node
            .append('text')
            .attr('dy', '.31em')
            .attr('text-anchor', function (d) {
              return d.x < 180 ? 'start' : 'end';
            })
            .attr('transform', function (d) {
              return d.x < 180 ? 'translate(8)' : 'rotate(180)translate(-8)';
            })
            .text(function (d) {
              return d.name;
            });

          minimap.render();
        },
      );

      //d3.select(self.frameElement).style("height", _height + "px");
    };

    /** RENDER **/
    canvas.render = function () {
      svgDefs
        .select('.clipPath .background')
        .attr('width', _width)
        .attr('height', _height);

      svg
        .attr(
          'width',
          _width +
            wrapperBorder * 2 +
            minimapPadding * 2 +
            _width * minimapScale,
        )
        .attr('height', _height + wrapperBorder * 2);

      outerWrapper
        .select('.background')
        .attr('width', _width + wrapperBorder * 2)
        .attr('height', _height + wrapperBorder * 2);

      innerWrapper
        .attr(
          'transform',
          'translate(' + wrapperBorder + ',' + wrapperBorder + ')',
        )
        .select('.background')
        .attr('width', _width)
        .attr('height', _height);

      panCanvas
        .attr('width', _width)
        .attr('height', _height)
        .select('.background')
        .attr('width', _width)
        .attr('height', _height);

      minimap
        .x(_width + minimapPadding)
        .y(minimapPadding)
        .render();
    };

    canvas.zoomEnabled = function (isEnabled) {
      if (!arguments.length) {
        return zoomEnabled;
      }
      zoomEnabled = isEnabled;
    };

    canvas.dragEnabled = function (isEnabled) {
      if (!arguments.length) {
        return dragEnabled;
      }
      dragEnabled = isEnabled;
    };

    canvas.reset = function () {
      d3.transition()
        .duration(750)
        .tween('zoom', function () {
          var ix = d3.interpolate(xScale.domain(), [-_width / 2, _width / 2]),
            iy = d3.interpolate(yScale.domain(), [-_height / 2, _height / 2]),
            iz = d3.interpolate(scale, 1);
          return function (t) {
            zoom
              .scale(iz(t))
              .x(xScale.domain(ix(t)))
              .y(yScale.domain(iy(t)));
            zoomHandler(iz(t));
          };
        });
    };
  }

  //============================================================
  // Accessors
  //============================================================

  canvas.width = function (value) {
    if (!arguments.length) return _width;
    _width = parseInt(value, 10);
    return this;
  };

  canvas.height = function (value) {
    if (!arguments.length) return _height;
    _height = parseInt(value, 10);
    return this;
  };

  canvas.scale = function (value) {
    if (!arguments.length) {
      return scale;
    }
    scale = value;
    return this;
  };

  canvas.nodes = function (value) {
    if (!arguments.length) {
      return nodes;
    }
    nodes = value;
    return this;
  };

  return canvas;
};

/** MINIMAP **/
demo.minimap = function () {
  'use strict';

  var minimapScale = 0.1,
    scale = 1,
    zoom = null,
    base = null,
    target = null,
    width = 0,
    height = 0,
    x = 0,
    y = 0,
    frameX = 0,
    frameY = 0;

  function minimap(selection) {
    base = selection;

    var container = selection.append('g').attr('class', 'minimap').call(zoom);

    zoom.on('zoom.minimap', function () {
      scale = d3.event.scale;
    });

    minimap.node = container.node();

    var frame = container.append('g').attr('class', 'frame');

    frame
      .append('rect')
      .attr('class', 'background')
      .attr('width', width)
      .attr('height', height)
      .attr('filter', 'url(#minimapDropShadow_cwbjo)');

    var drag = d3.behavior
      .drag()
      .on('dragstart.minimap', function () {
        var frameTranslate = d3.demo.util.getXYFromTranslate(
          frame.attr('transform'),
        );
        frameX = frameTranslate[0];
        frameY = frameTranslate[1];
      })
      .on('drag.minimap', function () {
        d3.event.sourceEvent.stopImmediatePropagation();
        frameX += d3.event.dx;
        frameY += d3.event.dy;
        frame.attr('transform', 'translate(' + frameX + ',' + frameY + ')');
        var translate = [-frameX * scale, -frameY * scale];
        target.attr(
          'transform',
          'translate(' + translate + ')scale(' + scale + ')',
        );
        zoom.translate(translate);
      });

    frame.call(drag);

    /** RENDER **/
    minimap.render = function () {
      scale = zoom.scale();
      container.attr(
        'transform',
        'translate(' + x + ',' + y + ')scale(' + minimapScale + ')',
      );
      var node = target.node().cloneNode(true);
      node.removeAttribute('id');
      base.selectAll('.minimap .panCanvas').remove();
      minimap.node.appendChild(node);
      var targetTransform = d3.demo.util.getXYFromTranslate(
        target.attr('transform'),
      );
      frame
        .attr(
          'transform',
          'translate(' +
            -targetTransform[0] / scale +
            ',' +
            -targetTransform[1] / scale +
            ')',
        )
        .select('.background')
        .attr('width', width / scale)
        .attr('height', height / scale);
      frame.node().parentNode.appendChild(frame.node());
      d3.select(node).attr('transform', 'translate(1,1)');
    };
  }

  //============================================================
  // Accessors
  //============================================================

  minimap.width = function (value) {
    if (!arguments.length) return width;
    width = parseInt(value, 10);
    return this;
  };

  minimap.height = function (value) {
    if (!arguments.length) return height;
    height = parseInt(value, 10);
    return this;
  };

  minimap.x = function (value) {
    if (!arguments.length) return x;
    x = parseInt(value, 10);
    return this;
  };

  minimap.y = function (value) {
    if (!arguments.length) return y;
    y = parseInt(value, 10);
    return this;
  };

  minimap.scale = function (value) {
    if (!arguments.length) {
      return scale;
    }
    scale = value;
    return this;
  };

  minimap.minimapScale = function (value) {
    if (!arguments.length) {
      return minimapScale;
    }
    minimapScale = value;
    return this;
  };

  minimap.zoom = function (value) {
    if (!arguments.length) return zoom;
    zoom = value;
    return this;
  };

  minimap.target = function (value) {
    if (!arguments.length) {
      return target;
    }
    target = value;
    width = parseInt(target.attr('width'), 10);
    height = parseInt(target.attr('height'), 10);
    return this;
  };

  return minimap;
};

demo.forcecircle = function () {
  'use strict';

  var cx = 0,
    cy = 0,
    r = 0,
    color = '#000000',
    node = null,
    base = null;

  function forcecircle(selection) {
    base = selection;
    forcecircle.base = base;
    node = base.append('circle').attr('class', 'forcecircle');

    function render() {
      node.attr('cx', cx).attr('cy', cy).attr('r', r).style('fill', color);
    }

    forcecircle.render = render;

    render();
  }

  //============================================================
  // Accessors
  //============================================================

  forcecircle.cx = function (value) {
    if (!arguments.length) return cx;
    cx = parseInt(value, 10);
    return this;
  };

  forcecircle.cy = function (value) {
    if (!arguments.length) return cy;
    cy = parseInt(value, 10);
    return this;
  };

  forcecircle.r = function (value) {
    if (!arguments.length) return r;
    r = parseInt(value, 10);
    return this;
  };

  forcecircle.color = function (value) {
    if (!arguments.length) return color;
    color = value;
    return this;
  };

  forcecircle.node = function () {
    return node;
  };

  forcecircle.x = 0;
  forcecircle.y = 0;

  return forcecircle;
};

/** UTILS **/
demo.util = {};
demo.util.getXYFromTranslate = function (translateString) {
  var currentTransform = d3.transform(translateString);
  currentX = currentTransform.translate[0];
  currentY = currentTransform.translate[1];
  return [currentX, currentY];
};

var circleCount = 0;
var canvas = demo.canvas();

// d3.select("#canvas_cwbjo").call(canvas);
// canvas.loadTree();
