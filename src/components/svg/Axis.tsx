import { useMemo } from 'react';
import { scaleLinear } from 'd3';

type AxisProps = {
  domain: [number, number];
  range: [number, number];
  label?: string;
};

type AxisBottomProps = AxisProps & { height: number };

export function AxisBottom({
  domain = [0, 100],
  range = [10, 290],
  height = 100,
  label,
}: AxisBottomProps): JSX.Element {
  const ticks = useMemo(() => {
    const scale = scaleLinear().domain(domain).range(range);
    const width = range[1] - range[0];
    const pixelsPerTick = 30;
    const numberOfTicksTarget = Math.max(1, Math.floor(width / pixelsPerTick));
    return scale.ticks(numberOfTicksTarget).map((value) => ({
      value,
      offset: scale(value),
    }));
  }, [domain, range]);

  const [x0, x1] = range;

  return (
    <g transform={`translate(0, ${height})`}>
      <path
        d={['M', x0, 6, 'v', -6, 'H', x1, 'v', 6].join(' ')}
        fill="none"
        stroke="currentColor"
      />
      {ticks.map(({ value, offset }) => (
        <g key={value} transform={`translate(${offset}, 0)`}>
          <line y2="6" stroke="currentColor" />
          <text
            fill="currentColor"
            strokeWidth={0}
            fontSize="10px"
            textAnchor="middle"
            transform="translate(0, 20)"
          >
            {value}
          </text>
        </g>
      ))}
      {label !== null && (
        <text
          textAnchor="middle"
          fill="currentColor"
          strokeWidth={0}
          transform={`translate(${x1 / 2}, ${40})`}
          fontSize="14"
        >
          {label}
        </text>
      )}
    </g>
  );
}

export function AxisLeft({
  domain = [0, 100],
  range = [10, 290],
  label,
}: AxisProps): JSX.Element {
  const ticks = useMemo(() => {
    const scale = scaleLinear().domain(domain).range(range);
    const height = range[1] - range[0];
    const pixelsPerTick = 30;
    const numberOfTicksTarget = Math.max(1, Math.floor(height / pixelsPerTick));
    return scale.ticks(numberOfTicksTarget).map((value) => ({
      value,
      offset: scale(value),
    }));
  }, [domain, range]);

  const [y0, y1] = range;

  return (
    <g>
      <path
        d={['M', -6, y0, 'h', 6, 'V', y1, 'h', -6].join(' ')}
        fill="none"
        stroke="currentColor"
      />
      {ticks.map(({ value, offset }) => (
        <g key={value} transform={`translate(0, ${y1 - offset})`}>
          <line x2="-6" stroke="currentColor" />
          <text
            fill="currentColor"
            strokeWidth={0}
            dy="3px"
            fontSize="10px"
            textAnchor="middle"
            transform="translate(-20, 0)"
          >
            {value}
          </text>
        </g>
      ))}
      {label != null && (
        <text
          fill="currentColor"
          strokeWidth={0}
          transform={`translate(-40, ${y1 / 2}) rotate(-90)`}
          textAnchor="middle"
          fontSize="14"
        >
          {label}
        </text>
      )}
    </g>
  );
}
