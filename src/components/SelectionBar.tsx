import { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react';
import { Box, Button, IconButton, Text } from '@chakra-ui/react';
import { LuX } from 'react-icons/lu';
import { useStore } from '../store';
import type { Bioregion } from '../store/InfomapStore';
import { formatThousands } from '../utils/formats';
import { Tooltip } from './ui/tooltip';
import { controlPanelWidth } from './ControlPanel/ControlPanel';

/** Below this share of the map in the viewport, the selection is out of sight. */
const MAP_HIDDEN_RATIO = 0.3;

const count = (n: number, one: string, many = `${one}s`) =>
  `${formatThousands(n)} ${n === 1 ? one : many}`;

/** Whether the bioregion's own entry in the list (a card header, or a compact row) is on screen,
 *  where the bar would only repeat it. The list mounts lazily and swaps cards for rows with the
 *  density, so the observed elements are re-queried whenever the list's DOM changes. */
function useListEntryVisible(id: number | null, bioregions: Bioregion[]) {
  const [visible, setVisible] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new `bioregions` remounts the list
  useEffect(() => {
    setVisible(false);
    const list = document.getElementById('bioregions');
    if (id === null || !list) return;
    const selector =
      `[data-testid=bioregion-card][data-bioregion-id="${id}"] [data-testid=bioregion-card-header],` +
      `[data-testid=bioregion-row][data-bioregion-id="${id}"]`;
    const inView = new Set<Element>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) inView.add(e.target);
        else inView.delete(e.target);
      }
      setVisible(inView.size > 0);
    });
    let targets: Element[] = [];
    const attach = () => {
      const next = Array.from(list.querySelectorAll(selector));
      if (
        next.length === targets.length &&
        next.every((el, i) => el === targets[i])
      )
        return;
      io.disconnect();
      inView.clear();
      targets = next;
      for (const el of targets) io.observe(el);
      if (targets.length === 0) setVisible(false);
    };
    attach();
    const mo = new MutationObserver(attach);
    mo.observe(list, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      io.disconnect();
    };
  }, [id, bioregions]);

  return visible;
}

/** Floating bar that keeps a bioregion selection visible (and reachable) once the map has
 *  scrolled out of view, e.g. while reading its card further down. Centered over the main
 *  column; it stays mounted so it can fade/slide out, showing the last selection meanwhile. */
export default observer(function SelectionBar() {
  const { selectionStore, infomapStore, colorStore, mapStore } = useStore();
  const id = selectionStore.selectedId;
  const current =
    id === null
      ? undefined
      : infomapStore.bioregions.find((b) => b.bioregionId === id);
  const lastRef = useRef<Bioregion | undefined>(undefined);
  if (current) lastRef.current = current;
  const bioregion = current ?? lastRef.current;
  const cardVisible = useListEntryVisible(id, infomapStore.bioregions);
  const shown =
    current !== undefined &&
    mapStore.mapVisibleRatio < MAP_HIDDEN_RATIO &&
    !cardVisible;

  return (
    <Box
      position="fixed"
      bottom="16px"
      // The main column: right of the fixed control panel (+ its gap and the map's margin),
      // clear of the right padding.
      left={`${controlPanelWidth + 25 + 16}px`}
      right="40px"
      display="flex"
      justifyContent="center"
      pointerEvents="none"
      zIndex="sticky"
    >
      {bioregion && (
        <Box
          data-testid="selection-bar"
          role="region"
          aria-label="Selection"
          aria-hidden={!shown}
          inert={!shown}
          display="flex"
          alignItems="center"
          gap={3}
          minW={0}
          maxW="100%"
          pl={3}
          pr={1.5}
          py={1.5}
          bg="bg.panel"
          borderWidth="1px"
          borderColor="border"
          borderRadius="lg"
          boxShadow="lg"
          fontSize="sm"
          whiteSpace="nowrap"
          pointerEvents={shown ? 'auto' : 'none'}
          opacity={shown ? 1 : 0}
          transform={shown ? 'translateY(0)' : 'translateY(8px)'}
          visibility={shown ? 'visible' : 'hidden'}
          transition="opacity 150ms ease-out, transform 150ms ease-out, visibility 150ms"
          _motionReduce={{ transition: 'none' }}
          css={{ fontVariantNumeric: 'tabular-nums' }}
        >
          <Box
            w="12px"
            h="12px"
            borderRadius="2px"
            flexShrink={0}
            bg={colorStore.colorBioregion(bioregion.bioregionId)}
            boxShadow="inset 0 0 0 1px rgba(0,0,0,0.15)"
          />
          <Text fontWeight="600" color="fg">
            Bioregion {bioregion.bioregionId} selected
          </Text>
          <Text color="fg.muted" truncate minW={0}>
            {count(bioregion.numRecords, 'record')} ·{' '}
            {count(bioregion.numSpecies, 'species', 'species')} ·{' '}
            {count(bioregion.numGridCells, 'cell')}
          </Text>
          <Box display="flex" alignItems="center" gap={1} flexShrink={0}>
            <Button
              size="xs"
              variant="subtle"
              onClick={() => mapStore.showOnMap(bioregion)}
            >
              View on map ↑
            </Button>
            <Tooltip
              content="Clear selection (Esc)"
              showArrow
              openDelay={250}
              closeDelay={50}
            >
              <IconButton
                aria-label="Clear selection"
                size="xs"
                variant="ghost"
                onClick={() => selectionStore.select(null)}
              >
                <LuX />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      )}
    </Box>
  );
});
