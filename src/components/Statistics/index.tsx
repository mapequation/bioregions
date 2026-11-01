import { observer } from 'mobx-react';
import {
  Box,
  Flex,
  Heading,
  SegmentGroup,
  Text,
  VStack,
} from '@chakra-ui/react';
import Bioregions from './Bioregions';
import SpeciesList from './SpeciesList';
import { useStore } from '../../store';
import type { StatisticsBy } from '@/store/SettingsStore';
import { plural } from './format';

const STATISTICS_BY_ITEMS: { value: StatisticsBy; label: string }[] = [
  { value: 'bioregions', label: 'Bioregions' },
  { value: 'species', label: 'Species' },
];

export default observer(function Statistics() {
  const { infomapStore, settingsStore, speciesStore } = useStore();
  const { haveBioregions } = infomapStore;
  const byBioregions =
    haveBioregions && settingsStore.statisticsBy === 'bioregions';

  if (speciesStore.numSpecies === 0) {
    return null;
  }

  return (
    <VStack
      w="100%"
      gap={3}
      align="stretch"
      // Room to scroll the last bioregion above the floating selection bar, then a hairline and
      // ~48px (with the parent's gap) before the documentation that follows.
      pb={byBioregions ? '80px' : 8}
      mb={10}
      borderBottomWidth="1px"
      borderColor="border.muted"
    >
      <StatisticsHeader byBioregions={byBioregions} />
      {byBioregions ? <Bioregions /> : <SpeciesList />}
    </VStack>
  );
});

const StatisticsHeader = observer(function StatisticsHeader({
  byBioregions,
}: {
  byBioregions: boolean;
}) {
  const { infomapStore, settingsStore, speciesStore } = useStore();
  const { haveBioregions, numBioregions } = infomapStore;

  const summary = [
    plural(speciesStore.numRecords, 'record'),
    plural(speciesStore.numSpecies, 'species', 'species'),
  ];
  if (haveBioregions) {
    summary.unshift(plural(numBioregions, 'bioregion'));
  }

  return (
    <Flex wrap="wrap" align="end" justify="space-between" gap="3">
      <Box>
        <Heading as="h2" fontSize="xl" fontWeight={600} lineHeight="1.3">
          {byBioregions ? 'Bioregions' : 'Species'}
        </Heading>
        <Text fontSize="sm" color="fg.muted" fontVariantNumeric="tabular-nums">
          {summary.join(' · ')}
        </Text>
      </Box>
      {haveBioregions && (
        <SegmentGroup.Root
          size="sm"
          aria-label="Statistics by"
          value={settingsStore.statisticsBy}
          onValueChange={(e) =>
            settingsStore.setStatisticsBy(e.value as StatisticsBy)
          }
        >
          <SegmentGroup.Indicator />
          <SegmentGroup.Items items={STATISTICS_BY_ITEMS} />
        </SegmentGroup.Root>
      )}
    </Flex>
  );
});
