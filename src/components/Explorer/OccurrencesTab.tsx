import { Box, Drawer, Grid, Portal } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from '../../store';
import { DrawerCloseTrigger } from '../ui/drawer';
import { explorerUi, useInsightsDrawer } from './explorerUi';
import InsightsColumn from './insights/InsightsColumn';
import LoadDock from './load/LoadDock';
import MethodsStrip from './load/MethodsStrip';
import PreviewColumn from './preview/PreviewColumn';
import QueryColumn from './query/QueryColumn';

type Band = { top: number; height: number };

/** Viewport band of `ref` (top and height), tracked while `active`: the drawer and its scrim live in it. */
function useBand(ref: RefObject<HTMLElement | null>, active: boolean): Band | null {
  const [band, setBand] = useState<Band | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBand((b) => (b && b.top === r.top && b.height === r.height ? b : { top: r.top, height: r.height }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [ref, active]);
  return band;
}

/**
 * Insights below 1280 px: a modal drawer whose panel and scrim span only the workspace row,
 * between the header (source chips) and the methods strip, so neither is ever covered.
 */
const InsightsDrawer = observer(function InsightsDrawer({ band }: { band: Band | null }) {
  const place = band ? { top: `${band.top}px`, h: `${band.height}px` } : {};
  return (
    <Drawer.Root
      open={explorerUi.insightsOpen}
      onOpenChange={(e) => explorerUi.setInsightsOpen(e.open)}
      placement="end"
      size="xs"
      // Back to the KPI-strip button also after a click on the scrim (default: the clicked spot).
      finalFocusEl={() => document.querySelector<HTMLElement>('[data-testid="insights-toggle"]')}
    >
      <Portal>
        <Drawer.Backdrop {...place} bg="blackAlpha.400" _dark={{ bg: 'blackAlpha.600' }} />
        <Drawer.Positioner {...place}>
          <Drawer.Content w="320px" maxW="320px" maxH="full" h="full" borderLeftWidth="1px" shadow="lg">
            <Drawer.Header py={3} px={4} borderBottomWidth="1px">
              <Drawer.Title fontSize="sm">Insights</Drawer.Title>
            </Drawer.Header>
            <DrawerCloseTrigger top={1.5} />
            <Drawer.Body px={4} py={3} data-testid="insights" overscrollBehavior="contain">
              <InsightsColumn />
            </Drawer.Body>
          </Drawer.Content>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
  );
});

/**
 * Occurrences workspace: query (300 px) · preview (1fr) · insights (280 px), then the
 * methods strip and the load dock. Below 1280 px the query column narrows to 280 px and
 * the insights move into a right drawer opened from the KPI strip (explorerUi.insightsOpen).
 */
export default observer(function OccurrencesTab() {
  const { explorerStore } = useStore();
  const drawer = useInsightsDrawer();
  const focus = explorerStore.insightFocus;
  const previewRef = useRef<HTMLDivElement>(null);
  const band = useBand(previewRef, drawer);

  // "Show countries" on a bias flag must reveal the insights, also when they live in the drawer.
  useEffect(() => {
    if (drawer && focus) explorerUi.setInsightsOpen(true);
  }, [drawer, focus]);

  // Leaving drawer mode closes the drawer so it does not reappear on the next narrow resize.
  useEffect(() => {
    if (!drawer) explorerUi.setInsightsOpen(false);
  }, [drawer]);

  return (
    <Grid
      h="full"
      minH={0}
      templateColumns={{ base: '280px minmax(0, 1fr)', xl: '300px minmax(0, 1fr) 280px' }}
      templateRows="minmax(0, 1fr) auto auto"
    >
      <Box
        as="section"
        aria-label="Explorer query"
        overflowY="auto"
        overscrollBehavior="contain"
        borderRightWidth="1px"
        bg="bg.subtle"
        minH={0}
      >
        <QueryColumn />
      </Box>
      <Box
        ref={previewRef}
        as="section"
        aria-label="Explorer preview"
        overflowY="auto"
        overscrollBehavior="contain"
        minH={0}
        minW={0}
        px={4}
        py={3}
      >
        <PreviewColumn />
      </Box>
      {!drawer && (
        <Box
          as="aside"
          aria-label="Explorer insights"
          data-testid="insights"
          overflowY="auto"
          overscrollBehavior="contain"
          borderLeftWidth="1px"
          minH={0}
          px={4}
          py={3}
        >
          <InsightsColumn />
        </Box>
      )}
      <Box gridColumn="1 / -1" borderTopWidth="1px">
        <MethodsStrip />
      </Box>
      <Box gridColumn="1 / -1" borderTopWidth="1px">
        <LoadDock />
      </Box>
      {drawer && <InsightsDrawer band={band} />}
    </Grid>
  );
});
