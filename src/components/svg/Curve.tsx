import { SVGProps } from 'react';
import { scaleLinear } from 'd3';

type CurveProps = {
  data: [number, number][];
  width: number;
  height: number;
  xDomain: [number, number];
  yDomain: [number, number];
};

export default function Curve({
  data,
  width,
  height,
  xDomain,
  yDomain,
  ...props
}: CurveProps & SVGProps<SVGPathElement>) {
  const xScale = scaleLinear().domain(xDomain).range([0, width]);
  const yScale = scaleLinear().domain(yDomain).range([height, 0]);

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
