import { Box, chakra } from '@chakra-ui/react';
import { reaction } from 'mobx';
import { observer } from 'mobx-react';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store';
import type { Bioregion } from '../../store/InfomapStore';
import { drawMinimap, formatBBox, getFrame, minimapWidth, whenVisible } from '../../utils/minimap';
import { useColorMode } from '../ui/color-mode';
import { Tooltip } from '../ui/tooltip';

export const MINIMAP_HEIGHT = 112;

export interface BioregionMinimapProps {
  bioregion: Bioregion;
  height?: number;
  /** Render a "Show on map" button around the canvas (default true). */
  interactive?: boolean;
}

/** Small-multiple map of where a bioregion lies in the study area. All minimaps share one frame
 *  (the data extent); the region's cells are drawn in its color on top of all cells in gray. */
export const BioregionMinimap = observer(function BioregionMinimap({
  bioregion,
  height = MINIMAP_HEIGHT,
  interactive = true,
}: BioregionMinimapProps) {
  const { speciesStore, colorStore, infomapStore, landStore, mapStore, selectionStore } =
    useStore();
  const { colorMode } = useColorMode();
  const mode = colorMode === 'dark' ? 'dark' : 'light';
  const width = minimapWidth(height, getFrame(speciesStore.binner.cells));
  // 1px border inside the box
  const canvasWidth = width - 2;
  const canvasHeight = height - 2;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || visible) return;
    return whenVisible(canvas, () => setVisible(true));
  }, [visible]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !visible) return;
    // Redraw on color, result, grid or land changes; the draw itself is untracked.
    return reaction(
      () => ({
        color: colorStore.colorBioregion(bioregion.bioregionId) ?? 'gray',
        cells: speciesStore.binner.cells,
        bioregions: infomapStore.bioregions,
        landLoaded: landStore.loaded,
      }),
      ({ color, cells }) =>
        drawMinimap(canvas, {
          cells,
          regionCells: bioregion.cells,
          bbox: bioregion.bbox,
          color,
          width: canvasWidth,
          height: canvasHeight,
          mode,
          land: landStore.land110m,
        }),
      {
        fireImmediately: true,
        equals: (a, b) =>
          a.color === b.color &&
          a.cells === b.cells &&
          a.bioregions === b.bioregions &&
          a.landLoaded === b.landLoaded,
      },
    );
  }, [
    visible,
    bioregion,
    mode,
    canvasWidth,
    canvasHeight,
    colorStore,
    speciesStore,
    infomapStore,
    landStore,
  ]);

  const canvas = (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{ display: 'block', width: canvasWidth, height: canvasHeight }}
    />
  );

  if (!interactive) {
    return (
      <Box
        flexShrink={0}
        w={`${width}px`}
        h={`${height}px`}
        borderWidth="1px"
        borderColor="border"
        borderRadius="6px"
        overflow="hidden"
      >
        {canvas}
      </Box>
    );
  }

  const id = bioregion.bioregionId;
  return (
    <Tooltip content="Show on map" openDelay={400} showArrow>
      <chakra.button
        type="button"
        data-testid="bioregion-minimap"
        aria-label={`Show Bioregion ${id} on the map (${formatBBox(bioregion.bbox)})`}
        position="relative"
        flexShrink={0}
        w={`${width}px`}
        h={`${height}px`}
        p={0}
        borderWidth="1px"
        borderColor="border"
        borderRadius="6px"
        overflow="hidden"
        cursor="pointer"
        transition="border-color 0.15s"
        _hover={{ borderColor: 'border.emphasized' }}
        _focusVisible={{
          outline: '2px solid',
          outlineColor: 'colorPalette.focusRing',
          outlineOffset: '2px',
        }}
        css={{ '&:hover > .minimap-glyph, &:focus-visible > .minimap-glyph': { opacity: 1 } }}
        onClick={(event) => {
          event.stopPropagation();
          mapStore.showOnMap(bioregion);
        }}
        onPointerEnter={() => selectionStore.preview(id)}
        onPointerLeave={() => selectionStore.preview(null)}
      >
        {canvas}
        <Box
          as="span"
          aria-hidden
          className="minimap-glyph"
          position="absolute"
          top="2px"
          right="3px"
          px="1"
          lineHeight="1.2"
          fontSize="xs"
          color="fg"
          bg="bg.panel/80"
          borderRadius="sm"
          opacity={0}
          transition="opacity 0.15s"
          pointerEvents="none"
        >
          ↗
        </Box>
      </chakra.button>
    </Tooltip>
  );
});
