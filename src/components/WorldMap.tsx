import { useEffect, useRef } from 'react';
import { observer } from 'mobx-react';
import { useStore } from '../store/';
import {
  Badge,
  Box,
  Card,
  CardBody,
  CardHeader,
  Heading,
  Text,
} from '@chakra-ui/react';

const Tooltip = observer(function _Tooltip() {
  const { mapStore } = useStore();
  const { tooltipCell: cell } = mapStore;

  if (!cell) {
    return null;
  }

  const [x, y] = mapStore.tooltipPos;
  return (
    <Box pos="absolute" left={x} top={y} pointerEvents="none">
      <Card bgColor="rgba(255,255,255,0.2)">
        <CardHeader pb={0}>
          <Heading size="xs">
            Cell <small style={{ color: '#cccccc' }}>{cell.id}</small>
          </Heading>
        </CardHeader>
        <CardBody>
          <Box>
            <Text style={{ display: 'inline-block' }}>
              Size: {cell.sizeString}
              <small>x</small>
              {cell.sizeString}
            </Text>
            <Text>({Math.round(cell.area)} km2)</Text>
            <Badge ml={2} bgColor={cell.color}>
              Bioregion {cell.bioregionId}
            </Badge>
          </Box>
          <Box>{}</Box>
        </CardBody>
      </Card>
    </Box>
  );
});

export default observer(function WorldMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { mapStore } = useStore();
  const { width, height } = mapStore;

  useEffect(() => {
    if (canvasRef.current === null) {
      return;
    }

    mapStore.setCanvas(canvasRef.current);
  }, [mapStore]);

  return (
    <Box ml={4} position="relative">
      <canvas
        width={width}
        height={height}
        ref={canvasRef}
        onMouseMove={mapStore.onMouseMove}
        onMouseOver={mapStore.onMouseEnter}
        onMouseOut={mapStore.onMouseLeave}
        onClick={mapStore.onMouseClick}
      />
      <Tooltip />
    </Box>
  );
});
