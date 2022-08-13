import { useMemo } from 'react';
import { scaleLinear, scaleLog } from 'd3';

type AxisProps = {
  domain: [number, number];
  xRange: [number, number];
  yRange: [number, number];
  yLog?: boolean;
  label?: string;
  tickFormat?: (value: number) => string;
  ticksColor?: string;
};

export function AxisBottom({
  domain = [0, 100],
  xRange = [10, 290],
  yRange = [90, 10],
  label,
  tickFormat,
  ticksColor="currentColor",
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
        <g key={`bottom-${value}`} transform={`translate(${offset}, 0)`}>
          <line y2="2" stroke="currentColor" strokeWidth={0.5} />
          <text
            fill={ticksColor}
            strokeWidth={0}
            fontSize="4px"
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
          fontSize="6px"
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
  yLog,
  label,
  tickFormat,
  ticksColor="currentColor",
}: AxisProps): JSX.Element {
  const ticks = useMemo(() => {
    const _scale = yLog ? scaleLog : scaleLinear;
    const scale = _scale().domain(domain).range(yRange);
    const height = Math.abs(yRange[0] - yRange[1]);
    const pixelsPerTick = 20;
    const numberOfTicksTarget = Math.max(1, Math.floor(height / pixelsPerTick));
    return scale.ticks(numberOfTicksTarget).map((value) => ({
      value: tickFormat ? tickFormat(value) : `${value}`,
      offset: scale(value),
    }));
  }, [domain, yRange, tickFormat, yLog]);

  const [y0, y1] = yRange;
  const yMid = (y0 + y1) / 2;

  return (
    <g transform={`translate(${xRange[0]}, 0)`} style={{ color: '#999999' }}>
      <path
        // d={['M', -3, y0, 'h', 3, 'V', y1, 'h', -3].join(' ')}
        d={['M', -3, y0, 'h', 3, 'V', y1].join(' ')}
        fill="none"
        stroke="currentColor"
        // display="none"
        strokeWidth={0.5}
      />
      {ticks.map(({ value, offset }) => (
        <g key={`left-${value}`} transform={`translate(0, ${offset})`}>
          <line x2="-2" stroke="currentColor" strokeWidth={0.5} />
          <text
            fill={ticksColor}
            strokeWidth={0}
            dy="2px"
            fontSize="4px"
            textAnchor="end"
            transform="translate(-5, 0)"
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
          fontSize="6px"
        >
          {label}
        </text>
      )}
    </g>
  );
}

export function AxisRight({
  domain = [0, 100],
  xRange = [10, 290],
  yRange = [90, 10],
  yLog,
  label,
  tickFormat,
  ticksColor="currentColor",
}: AxisProps): JSX.Element {
  const ticks = useMemo(() => {
    const _scale = yLog ? scaleLog : scaleLinear;
    const scale = _scale().domain(domain).range(yRange);
    const height = Math.abs(yRange[0] - yRange[1]);
    const pixelsPerTick = 20;
    const numberOfTicksTarget = Math.max(1, Math.floor(height / pixelsPerTick));
    return scale.ticks(numberOfTicksTarget).map((value) => ({
      value: tickFormat ? tickFormat(value) : `${value}`,
      offset: scale(value),
    }));
  }, [domain, yRange, tickFormat, yLog]);

  const [y0, y1] = yRange;
  const yMid = (y0 + y1) / 2;

  return (
    <g transform={`translate(${xRange[1]}, 0)`} style={{ color: '#999999' }}>
      <path
        // d={['M', -3, y0, 'h', 3, 'V', y1, 'h', -3].join(' ')}
        d={['M', -3, y0, 'h', 3, 'V', y1].join(' ')}
        fill="none"
        stroke="currentColor"
        // display="none"
        strokeWidth={0.5}
      />
      {ticks.map(({ value, offset }, i) => (
        <g key={`right-${i}`} transform={`translate(0, ${offset})`}>
          <line x2="2" stroke="currentColor" strokeWidth={0.5} />
          <text
            fill={ticksColor}
            strokeWidth={0}
            dy="2px"
            fontSize="4px"
            textAnchor="start"
            transform="translate(5, 0)"
          >
            {value}
          </text>
        </g>
      ))}
      {label != null && (
        <text
          fill="currentColor"
          strokeWidth={0}
          transform={`translate(15, ${yMid}) rotate(-90)`}
          textAnchor="middle"
          fontSize="6px"
        >
          {label}
        </text>
      )}
    </g>
  );
}
