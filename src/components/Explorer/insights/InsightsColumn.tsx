import { Box, Icon, Stack, Text } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { LuScanSearch } from 'react-icons/lu';
import { useStore } from '../../../store';
import BiasPanel from './BiasPanel';
import CompositionPanel from './CompositionPanel';

/** Bias checks and composition of the preview; the right column, or a Drawer body below 1280 px. */
export default observer(function InsightsColumn() {
  const { explorerStore: ex } = useStore();
  const empty = ex.previewState === 'empty';
  return (
    // The column / drawer body owns the landmark and data-testid="insights".
    <Box>
      {empty ? (
        <Stack align="center" textAlign="center" gap={2} py={8} px={2} color="fg.muted">
          <Icon as={LuScanSearch} boxSize={6} color="fg.muted" aria-hidden />
          <Text textStyle="sm" fontWeight="semibold" color="fg">
            Insights
          </Text>
          <Text textStyle="xs" lineHeight="short">
            Bias checks and the make-up of the records (datasets, species, countries) appear here once you add a
            taxon or pick a region.
          </Text>
        </Stack>
      ) : (
        <Stack gap={6}>
          <BiasPanel />
          <CompositionPanel />
        </Stack>
      )}
    </Box>
  );
});
