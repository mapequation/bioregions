import React, {PropTypes} from 'react';
import d3 from 'd3';

function renderPieChart(data) {

}

var PieChart = ({size, data, colors}) => {
  // data: [{clusterId, count}, ...]

  var arc = d3.svg.arc()
      .outerRadius(size / 2)
      .innerRadius(0);

  var pie = d3.layout.pie()
      .sort(null)
      .value(function(d) { return d.count; });

  var arcDescriptors = pie(data);
  var arcs = arcDescriptors.map((arcDescriptor, i) => (
    <path key={i} d={arc(arcDescriptor)} style={{stroke: 'white', fill: colors[arcDescriptor.data.clusterId]}}/>
  ));

  return (
    <svg width={size} height={size}>
      <g transform={`translate(${size / 2}, ${size / 2})`}>
        {arcs}
      </g>
    </svg>
  );
}

PieChart.propTypes = {
  size: PropTypes.number.isRequired, // diameter of the pie chart
  data: PropTypes.array.isRequired, //
  colors: PropTypes.array.isRequired,
}

export default PieChart;
