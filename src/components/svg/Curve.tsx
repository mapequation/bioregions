import { SVGProps } from 'react';
import { scaleLinear, scaleLog } from 'd3';

type CurveProps<T> = {
  data: T[];
  xAccessor: (d: T) => number;
  yAccessor: (d: T) => number;
  xRange: [number, number];
  yRange: [number, number];
  xDomain: [number, number];
  yDomain: [number, number];
  yLog?: boolean;
  stroke?: string;
  step?: boolean;
};

export default function Curve<T>({
  data,
  xAccessor,
  yAccessor,
  xRange,
  yRange,
  xDomain,
  yDomain,
  yLog,
  stroke="currentColor",
  step=true,
  ...props
}: CurveProps<T> & SVGProps<SVGPathElement>) {
  if (data.length < 2) {
    return null;
  }
  const xScale = scaleLinear().domain(xDomain).range(xRange);
  const _yScale = yLog ? scaleLog : scaleLinear;
  const yScale = _yScale().domain(yDomain).range(yRange).clamp(true); //.nice();
  let iStart = 0;
  // while (yLog && iStart < data.length && yAccessor(data[iStart]) == 0) {
  //   ++iStart;
  // }
  const d = [];
  for (let i = iStart; i < data.length; ++i) {
    d.push(`${i === iStart ? 'M' : 'L'} ${xScale(xAccessor(data[i]))} ${yScale(yAccessor(data[i]))}`);
    if (step && i + 1 < data.length) {
      d.push(`L ${xScale(xAccessor(data[i+1]))} ${yScale(yAccessor(data[i]))}`);
    }
  }

  return (
    <path
      d={d.join(' ')}
      fill="none"
      stroke={stroke}
      {...props}
    />
  );
}
