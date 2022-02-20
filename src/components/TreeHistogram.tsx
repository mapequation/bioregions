import { Box } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { format } from 'd3-format';
import type { HistogramDataPoint } from '../utils/tree';
import { AxisLeft, AxisBottom } from './svg/Axis';
import Curve from './svg/Curve';
// import { useStore } from '../store';

type TreeHistogramProps = {
  data: HistogramDataPoint[];
  isDisabled?: boolean;
  formatTime?: (time: number) => string;
};

export default observer(function TreeHistogram({
  data,
  isDisabled,
  formatTime,
}: TreeHistogramProps) {
  const xDomain = [0, 1] as [number, number];

  const maxNumBranches =
    data.length > 0 ? data[data.length - 1].numBranches : 1;
  const yDomain = [1, maxNumBranches] as [number, number];

  const d = data.map((d) => [d.t, d.numBranches] as [number, number]);

  const color = !isDisabled
    ? 'var(--chakra-colors-gray-800)'
    : 'var(--chakra-colors-gray-300)';

  const width = 130;
  const height = 100;
  const margin = { top: 10, right: 10, bottom: 20, left: 15 };
  const yRange = [height - margin.bottom, margin.top] as [number, number];
  const xRange = [margin.left, width - margin.right] as [number, number];

  const yTickFormat = format('.1s');

  return (
    <Box textAlign="center" pt={4} h={300}>
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
          dx={margin.left}
          fontSize="8px"
          // textAnchor="middle"
        >
          Branch count
        </text>
        <AxisLeft
          domain={yDomain}
          xRange={xRange}
          yRange={yRange}
          label=""
          yLog
          tickFormat={yTickFormat}
        />
        <AxisBottom
          domain={xDomain}
          xRange={xRange}
          yRange={yRange}
          label="Time"
          tickFormat={formatTime}
        />
        <Curve
          data={d}
          xDomain={xDomain}
          yDomain={yDomain}
          xRange={xRange}
          yRange={yRange}
          yLog
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
