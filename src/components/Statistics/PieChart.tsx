import { observer } from 'mobx-react';
import { useStore } from '../../store';

import { Table } from '@chakra-ui/react';

import {
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from '@/components/ui/popover';

export const SpeciesPieChart = observer(function _SpeciesPieChart({
  speciesName,
}: {
  speciesName: string;
}) {
  const { colorStore, speciesStore } = useStore();
  const { colorBioregion } = colorStore;

  const values = Array.from(
    speciesStore.speciesMap.get(speciesName)?.countPerRegion.entries() ?? [],
  );

  return <PieChart values={values} color={colorBioregion} />;
});

export default function PieChart({
  values,
  color,
}: {
  values: Iterable<[key: number, count: number]>;
  color: (_: number) => string;
}) {
  const [key, count] = [0, 1];
  const sorted = [...values].sort((a, b) => b[count] - a[count]);
  const total = sorted.reduce((tot, value) => tot + value[count], 0);
  sorted.forEach((value) => (value[count] /= total));

  const minFraction = 0.1;
  const aggregated = sorted.filter((value) => value[count] >= minFraction);

  const rest = [
    -1,
    sorted.reduce(
      (tot, value) => (value[count] < minFraction ? tot + value[count] : 0),
      0,
    ),
  ] as [number, number];

  if (rest[count] > 0) {
    aggregated.push(rest);
  }

  const restColor = 'rgba(0, 0, 0, 0.1)';
  let theta = -Math.PI / 2;
  const radius = 100;
  return (
    <PopoverRoot>
      <PopoverTrigger>
        <svg
          width="30px"
          height="30px"
          viewBox="-100 -100 200 200"
          style={{ marginInline: 'auto' }}
        >
          {aggregated.length === 0 && (
            <circle
              cx={0}
              cy={0}
              r={radius}
              fill={restColor}
              stroke="white"
              strokeWidth={4}
            />
          )}
          {aggregated.length === 1 && (
            <circle
              cx={0}
              cy={0}
              r={radius}
              fill={sorted[0][key] === -1 ? restColor : color(sorted[0][key])}
              stroke="white"
              strokeWidth={4}
            />
          )}
          {aggregated.length > 1 &&
            aggregated.map((value, i) => {
              const x0 = radius * Math.cos(theta);
              const y0 = radius * Math.sin(theta);
              const x1 = radius * Math.cos(theta + 2 * Math.PI * value[count]);
              const y2 = radius * Math.sin(theta + 2 * Math.PI * value[count]);
              theta += (2 * Math.PI * value[count]) % (2 * Math.PI);
              const largeArcFlag = value[count] > 0.5 ? 1 : 0;
              return (
                <path
                  key={i}
                  d={`M ${x0} ${y0} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x1} ${y2} L 0 0 Z`}
                  fill={value[key] === -1 ? restColor : color(value[key])}
                  stroke="white"
                  strokeWidth={4}
                />
              );
            })}
        </svg>
      </PopoverTrigger>
      <PopoverContent pointerEvents="none">
        <PopoverArrow />
        <PopoverBody>
          <Table.Root variant="line" size="sm">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader>Bioregion</Table.ColumnHeader>
                <Table.ColumnHeader>Percent</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {aggregated.map((value, i) => (
                <Table.Row
                  key={i}
                  bg={value[key] === -1 ? restColor : color(value[key])}
                  color={value[key] === -1 ? 'black' : 'white'}
                >
                  <Table.Cell>
                    {value[key] === -1 ? 'Rest' : `Bioregion ${value[key]}`}
                  </Table.Cell>
                  <Table.Cell>{(value[count] * 100).toFixed(2)}%</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </PopoverBody>
      </PopoverContent>
    </PopoverRoot>
  );
}
