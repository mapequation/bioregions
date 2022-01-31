import { observer } from 'mobx-react';
import { useStore } from '../../store';

import {
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverBody,
  PopoverArrow,
} from '@chakra-ui/react';

export default observer(function PieChart({
  values,
}: {
  values: Iterable<[key: number, count: number]>;
}) {
  const { colorStore } = useStore();
  const { colorBioregion } = colorStore;
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
    <Popover trigger="hover">
      <PopoverTrigger>
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
              fill={
                sorted[0][key] === -1
                  ? restColor
                  : colorBioregion(sorted[0][key])
              }
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
                  fill={
                    value[key] === -1 ? restColor : colorBioregion(value[key])
                  }
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
          <Table variant="simple" size="sm">
            <Thead>
              <Tr>
                <Th>Bioregion</Th>
                <Th isNumeric>Percent</Th>
              </Tr>
            </Thead>
            <Tbody>
              {aggregated.map((value, i) => (
                <Tr
                  key={i}
                  bg={
                    value[key] === -1 ? restColor : colorBioregion(value[key])
                  }
                  color={value[key] === -1 ? 'black' : 'white'}
                >
                  <Td>
                    {value[key] === -1 ? 'Rest' : `Bioregion ${value[key]}`}
                  </Td>
                  <Td isNumeric>{(value[count] * 100).toFixed(2)}%</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
});
