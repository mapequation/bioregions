import { Flex } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { AxisLeft, AxisBottom } from './svg/Axis';
import Curve from './svg/Curve';
// import { useStore } from '../store';

export default observer(function TreeHistogram({
  isDisabled = false,
}: {
  isDisabled?: boolean;
}) {
  // const { treeStore } = useStore();
  const width = 250;
  const height = 120;

  // const weight = treeStore.weightParameter;
  // const { data, domain } = treeStore.weightCurve;
  const domain = [0, 1] as [number, number];
  const data = [
    [0, 0],
    [0.5, 0.2],
    [1, 1],
  ] as [number, number][];

  // const inputProps = {
  //   min: 0,
  //   max: 1,
  //   step: 0.01,
  //   value: weight,
  // };

  const color = !isDisabled
    ? 'var(--chakra-colors-gray-800)'
    : 'var(--chakra-colors-gray-300)';

  return (
    <Flex w="100%" flexDirection="column" p={4}>
      <svg
        style={{ color, stroke: color }}
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`-40 -20 ${width + 70} ${height + 70}`}
        width={width}
        height={height}
      >
        <text x={50} y={50} stroke="#eeeeee">
          To be added
        </text>
        <AxisLeft domain={[0, 1]} range={[0, height]} label="Branch count" />
        <AxisBottom
          height={height}
          domain={domain}
          range={[0, width]}
          label="Time"
        />
        <Curve
          data={data}
          xDomain={domain}
          yDomain={[0, 1]}
          width={width}
          height={height}
          strokeWidth="2"
          stroke={
            !isDisabled && false
              ? 'var(--chakra-colors-blue-500)'
              : 'var(--chakra-colors-gray-100)'
          }
        />
      </svg>
    </Flex>
  );
});
