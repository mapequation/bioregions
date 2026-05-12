import { Box } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { format } from 'd3-format';
import { max } from 'd3-array';
import type { HistogramDataPoint } from '../utils/tree';
import { AxisLeft, AxisBottom } from './svg/Axis';
import Curve from './svg/Curve';
// import { useStore } from '../store';

type TreeHistogramProps = {
  data: HistogramDataPoint[];
  isDisabled?: boolean;
  formatTime?: (time: number) => string;
  title: string;
  yScale?: 'linear' | 'log';
};

export default observer(function TreeHistogram({
  data,
  isDisabled,
  formatTime,
  title = '',
  yScale = 'log',
}: TreeHistogramProps) {
  const yLog = yScale !== 'linear';
  const x = (d: HistogramDataPoint) => d.t;
  const y = (d: HistogramDataPoint) => d.value;
  const xDomain = [0, 1] as [number, number];

  const maxValue = max(data ?? [{ value: 1 }], (d) => d.value);
  let minValue = data.length > 0 ? data[0].value : 0;
  if (yLog && data.length > 0 && data[0].value == 0) {
    let i = 1;
    while (data[i].value == 0) {
      ++i;
    }
    minValue = data[i].value;
  }
  const yDomain = [minValue, maxValue] as [number, number];

  const color = !isDisabled
    ? 'var(--chakra-colors-gray-800)'
    : 'var(--chakra-colors-gray-300)';

  const width = 100;
  const height = 100;
  const margin = { top: 10, right: 10, bottom: 20, left: 15 };
  const yRange = [height - margin.bottom, margin.top] as [number, number];
  const xRange = [margin.left, width - margin.right] as [number, number];

  const yTickFormat = format('.1s');

  return (
    <Box textAlign="center" h={300}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="100%"
        height="100%"
        viewBox={`0 0 ${width} ${height}`}
        style={{ color, stroke: color }}
        preserveAspectRatio="xMidYMid meet"
      >
        <text
          fill="#999999"
          strokeWidth={0}
          x={margin.left}
          y={margin.top - 5}
          fontSize="6px"
          // textAnchor="middle"
        >
          {title}
        </text>
        <AxisLeft
          domain={yDomain}
          xRange={xRange}
          yRange={yRange}
          label="Lineages through time"
          yLog={yLog}
          tickFormat={yTickFormat}
        />
        <AxisBottom
          domain={xDomain}
          xRange={xRange}
          yRange={yRange}
          label="Time"
          tickFormat={formatTime}
        />
        <Curve<HistogramDataPoint>
          data={data}
          xAccessor={x}
          yAccessor={y}
          xDomain={xDomain}
          yDomain={yDomain}
          xRange={xRange}
          yRange={yRange}
          yLog={yLog}
          strokeWidth="1"
          stroke={
            !isDisabled
              ? 'var(--chakra-colors-blue-500)'
              : 'var(--chakra-colors-gray-100)'
          }
        />
      </svg>
    </Box>
  );
});
