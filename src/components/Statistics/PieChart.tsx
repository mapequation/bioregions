import { observer } from 'mobx-react';
import { useStore } from '../../store';

export default observer(function PieChart({
  values,
}: {
  values: { id: number; fraction: number }[];
}) {
  const { colorStore } = useStore();
  const { colorBioregion } = colorStore;
  const sorted = values.sort((a, b) => b.fraction - a.fraction);
  const total = sorted.reduce((tot, value) => tot + value.fraction, 0);
  sorted.forEach((value) => (value.fraction /= total));

  const minFraction = 0.1;
  const aggregated = sorted.filter((value) => value.fraction >= minFraction);

  const rest = {
    id: -1,
    fraction: sorted.reduce(
      (tot, value) => (value.fraction < minFraction ? tot + value.fraction : 0),
      0,
    ),
  };

  if (rest.fraction > 0) {
    aggregated.push(rest);
  }

  const restColor = 'rgba(0, 0, 0, 0.1)';
  let theta = -Math.PI / 2;
  const radius = 100;
  return (
    <svg
      width="30px"
      height="30px"
      viewBox="-100 -100 200 200"
      style={{ marginInline: 'auto' }}
    >
      {aggregated.length === 1 && (
        <circle
          cx={0}
          cy={0}
          r={radius}
          fill={sorted[0].id === -1 ? restColor : colorBioregion(sorted[0].id)}
          stroke="white"
          strokeWidth={4}
        />
      )}
      {aggregated.length > 1 &&
        aggregated.map((value, i) => {
          const x0 = radius * Math.cos(theta);
          const y0 = radius * Math.sin(theta);
          const x1 = radius * Math.cos(theta + 2 * Math.PI * value.fraction);
          const y2 = radius * Math.sin(theta + 2 * Math.PI * value.fraction);
          theta += (2 * Math.PI * value.fraction) % (2 * Math.PI);
          const largeArcFlag = value.fraction > 0.5 ? 1 : 0;
          return (
            <path
              key={i}
              d={`M ${x0} ${y0} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x1} ${y2} L 0 0 Z`}
              fill={value.id === -1 ? restColor : colorBioregion(value.id)}
              stroke="white"
              strokeWidth={4}
            />
          );
        })}
    </svg>
  );
});
