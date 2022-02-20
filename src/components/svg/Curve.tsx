import { SVGProps } from 'react';
import { scaleLinear, scaleLog } from 'd3';

type CurveProps = {
  data: [number, number][];
  xRange: [number, number];
  yRange: [number, number];
  xDomain: [number, number];
  yDomain: [number, number];
  yLog?: boolean;
};

export default function Curve({
  data,
  xRange,
  yRange,
  xDomain,
  yDomain,
  yLog,
  ...props
}: CurveProps & SVGProps<SVGPathElement>) {
  const xScale = scaleLinear().domain(xDomain).range(xRange);
  const _yScale = yLog ? scaleLog : scaleLinear;
  const yScale = _yScale().domain(yDomain).range(yRange);

  return (
    <path
      d={data
        .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${xScale(x)} ${yScale(y)}`)
        .join(' ')}
      fill="none"
      stroke="currentColor"
      {...props}
    />
  );
}
