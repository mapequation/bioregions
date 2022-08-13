import { Box } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { format } from 'd3-format';
import { max, min } from 'd3-array';
import type { HistogramDataPoint } from '../utils/tree';
import { AxisLeft, AxisBottom, AxisRight } from './svg/Axis';
import Curve from './svg/Curve';

type DualTreeHistogramProps = {
  dataLeft: HistogramDataPoint[];
  dataRight: HistogramDataPoint[];
  isDisabled?: boolean;
  formatTime?: (time: number) => string;
  labelLeft: string;
  labelRight: string;
  yScaleLeft?: 'linear' | 'log';
  yScaleRight?: 'linear' | 'log';
  stepLeft?: boolean;
  stepRight?: boolean;
  yTickFormatLeft?: string;
  yTickFormatRight?: string;
  yMinRight?: number;
};

export default observer(function DualTreeHistogram({
  dataLeft,
  dataRight,
  isDisabled,
  formatTime,
  labelLeft,
  labelRight,
  yScaleLeft = 'log',
  yScaleRight = 'log',
  stepLeft = true,
  stepRight = true,
  yTickFormatLeft = '.1s',
  yTickFormatRight = '.1s',
  yMinRight,
}: DualTreeHistogramProps) {
  const yLogLeft = yScaleLeft !== 'linear';
  const yLogRight = yScaleRight !== 'linear';
  const x = (d: HistogramDataPoint) => d.t;
  const y = (d: HistogramDataPoint) => d.value;
  const yRight = (d: HistogramDataPoint) => d.value;
  const xDomain = [0, 1] as [number, number];

  const maxValueLeft = max(dataLeft ?? [{ value: 1 }], (d) => d.value);
  const minValueLeft = yLogLeft
    ? min(dataLeft ?? [{ value: 1 }], (d) =>
        d.value == 0 ? Number.MAX_VALUE : d.value,
      )
    : min(dataLeft ?? [{ value: 1 }], (d) => d.value);
  const yDomainLeft = [minValueLeft, maxValueLeft] as [number, number];

  const maxValueRight = max(dataRight ?? [{ value: 1 }], (d) => d.value);
  const minValueRight =
    yMinRight != null
      ? yMinRight
      : yLogRight
      ? min(dataRight ?? [{ value: 1 }], (d) =>
          d.value == 0 ? Number.MAX_VALUE : d.value,
        )
      : min(dataRight ?? [{ value: 1 }], (d) => d.value);
  const yDomainRight = [minValueRight, maxValueRight] as [number, number];

  const color = !isDisabled
    ? 'var(--chakra-colors-gray-800)'
    : 'var(--chakra-colors-gray-300)';

  const strokeLeft = !isDisabled
    ? 'var(--chakra-colors-blue-500)'
    : 'var(--chakra-colors-gray-100)';

  const strokeRight = !isDisabled
    ? 'var(--chakra-colors-orange-500)'
    : 'var(--chakra-colors-gray-100)';

  const width = 100;
  const height = 100;
  const margin = { top: 18, right: 17, bottom: 20, left: 15 };
  const yRange = [height - margin.bottom, margin.top] as [number, number];
  const xRange = [margin.left, width - margin.right] as [number, number];

  const tickFormatLeft = format(yTickFormatLeft ?? '.1s');
  const tickFormatRight = format(yTickFormatRight ?? '.1s');
  const f = format;

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
          fill={strokeLeft}
          stroke={strokeLeft}
          strokeWidth={0.5}
          x={margin.left}
          y={margin.top - 12}
          fontSize="6px"
          // textAnchor="middle"
        >
          —
        </text>
        <text
          fill="#999999"
          strokeWidth={0}
          x={margin.left + 8}
          y={margin.top - 12}
          fontSize="6px"
          // textAnchor="middle"
        >
          {labelLeft}
        </text>
        <text
          fill={strokeRight}
          stroke={strokeRight}
          strokeWidth={0.5}
          x={margin.left}
          y={margin.top - 5}
          fontSize="6px"
          // textAnchor="middle"
        >
          —
        </text>
        <text
          fill="#999999"
          strokeWidth={0}
          x={margin.left + 8}
          y={margin.top - 5}
          fontSize="6px"
          // textAnchor="middle"
        >
          {labelRight}
        </text>
        <AxisLeft
          domain={yDomainLeft}
          xRange={xRange}
          yRange={yRange}
          label=""
          yLog={yLogLeft}
          tickFormat={tickFormatLeft}
          ticksColor={strokeLeft}
        />
        <AxisRight
          domain={yDomainRight}
          xRange={xRange}
          yRange={yRange}
          label=""
          yLog={yLogRight}
          tickFormat={tickFormatRight}
          ticksColor={strokeRight}
        />
        <AxisBottom
          domain={xDomain}
          xRange={xRange}
          yRange={yRange}
          label="Time"
          tickFormat={formatTime}
        />
        <Curve
          data={dataLeft}
          xAccessor={x}
          yAccessor={y}
          xDomain={xDomain}
          yDomain={yDomainLeft}
          xRange={xRange}
          yRange={yRange}
          yLog={yLogLeft}
          strokeWidth="1"
          stroke={strokeLeft}
          step={stepLeft}
        />
        <Curve
          data={dataRight}
          xAccessor={x}
          yAccessor={yRight}
          xDomain={xDomain}
          yDomain={yDomainRight}
          xRange={xRange}
          yRange={yRange}
          yLog={yLogRight}
          strokeWidth="1"
          stroke={strokeRight}
          step={stepRight}
        />
      </svg>
    </Box>
  );
});
