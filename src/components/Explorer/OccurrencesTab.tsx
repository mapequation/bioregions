import { Box, Grid } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { useEffect } from 'react';
import { useStore } from '../../store';
import { DrawerBody, DrawerCloseTrigger, DrawerContent, DrawerHeader, DrawerRoot, DrawerTitle } from '../ui/drawer';
import { explorerUi, useInsightsDrawer } from './explorerUi';
import InsightsColumn from './insights/InsightsColumn';
import LoadDock from './load/LoadDock';
import MethodsStrip from './load/MethodsStrip';
import PreviewColumn from './preview/PreviewColumn';
import QueryColumn from './query/QueryColumn';

const InsightsDrawer = observer(function InsightsDrawer() {
  return (
    <DrawerRoot
      open={explorerUi.insightsOpen}
      onOpenChange={(e) => explorerUi.setInsightsOpen(e.open)}
      placement="end"
    >
      <DrawerContent maxW="320px" w="320px">
        <DrawerHeader py={3} px={4} borderBottomWidth="1px">
          <DrawerTitle fontSize="sm">Insights</DrawerTitle>
        </DrawerHeader>
        <DrawerCloseTrigger />
        <DrawerBody px={4} py={3} data-testid="insights">
          <InsightsColumn />
        </DrawerBody>
      </DrawerContent>
    </DrawerRoot>
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
        aria-label="Query"
        overflowY="auto"
        overscrollBehavior="contain"
        borderRightWidth="1px"
        bg="bg.subtle"
        minH={0}
      >
        <QueryColumn />
      </Box>
      <Box as="section" aria-label="Preview" overflowY="auto" overscrollBehavior="contain" minH={0} minW={0} px={4} py={3}>
        <PreviewColumn />
      </Box>
      {!drawer && (
        <Box
          as="aside"
          aria-label="Insights"
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
      {drawer && <InsightsDrawer />}
    </Grid>
  );
});
