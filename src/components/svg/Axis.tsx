import { useMemo } from 'react';
import { scaleLinear, scaleLog } from 'd3';

type AxisProps = {
  domain: [number, number];
  xRange: [number, number];
  yRange: [number, number];
  label?: string;
  tickFormat?: (value: number) => string;
};

export function AxisBottom({
  domain = [0, 100],
  xRange = [10, 290],
  yRange = [90, 10],
  label,
  tickFormat,
}: AxisProps): JSX.Element {
  const ticks = useMemo(() => {
    const scale = scaleLinear().domain(domain).range(xRange);
    const width = xRange[1] - xRange[0];
    const pixelsPerTick = 30;
    const numberOfTicksTarget = Math.max(1, Math.floor(width / pixelsPerTick));
    return scale.ticks(numberOfTicksTarget).map((value) => ({
      value: tickFormat ? tickFormat(value) : `${value}`,
      offset: scale(value),
    }));
  }, [domain, xRange, tickFormat]);

  const [x0, x1] = xRange;
  const xMid = (x0 + x1) / 2;

  return (
    <g transform={`translate(0, ${yRange[0]})`} style={{ color: '#999' }}>
      <path
        d={['M', x0, 3, 'v', -3, 'H', x1, 'v', 3].join(' ')}
        fill="none"
        stroke="currentColor"
        // display="none"
        strokeWidth={0.5}
      />
      {ticks.map(({ value, offset }) => (
        <g key={value} transform={`translate(${offset}, 0)`}>
          <line y2="2" stroke="currentColor" strokeWidth={0.5} />
          <text
            fill="currentColor"
            strokeWidth={0}
            fontSize="5px"
            textAnchor="middle"
            transform="translate(0, 10)"
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
          transform={`translate(${xMid}, 18)`}
          fontSize="8"
        >
          {label}
        </text>
      )}
    </g>
  );
}

export function AxisLeft({
  domain = [0, 100],
  xRange = [10, 290],
  yRange = [90, 10],
  label,
  tickFormat,
}: AxisProps): JSX.Element {
  const ticks = useMemo(() => {
    // const scale = scaleLinear().domain(domain).range(yRange);
    const scale = scaleLog().domain(domain).range(yRange);
    const height = yRange[1] - yRange[0];
    const pixelsPerTick = 30;
    const numberOfTicksTarget = Math.max(1, Math.floor(height / pixelsPerTick));
    return scale.ticks(numberOfTicksTarget).map((value) => ({
      value: tickFormat ? tickFormat(value) : `${value}`,
      offset: scale(value),
    }));
  }, [domain, yRange, tickFormat]);

  const [y0, y1] = yRange;
  const yMid = (y0 + y1) / 2;

  return (
    <g transform={`translate(${xRange[0]}, 0)`} style={{ color: '#999999' }}>
      <path
        d={['M', -3, y0, 'h', 3, 'V', y1, 'h', -3].join(' ')}
        fill="none"
        stroke="currentColor"
        // display="none"
        strokeWidth={0.5}
      />
      {ticks.map(({ value, offset }) => (
        <g key={value} transform={`translate(0, ${offset})`}>
          <line x2="-2" stroke="currentColor" strokeWidth={0.5} />
          <text
            fill="currentColor"
            strokeWidth={0}
            dy="2px"
            fontSize="5px"
            textAnchor="middle"
            transform="translate(-10, 0)"
          >
            {value}
          </text>
        </g>
      ))}
      {label != null && (
        <text
          fill="currentColor"
          strokeWidth={0}
          transform={`translate(-15, ${yMid}) rotate(-90)`}
          textAnchor="middle"
          fontSize="8"
        >
          {label}
        </text>
      )}
    </g>
  );
}
