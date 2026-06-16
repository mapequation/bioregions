import { observer } from 'mobx-react';
import { HStack, VStack, Flex, Box } from '@chakra-ui/react';
import Bioregions from './Bioregions';
import SpeciesList from './SpeciesList';
import { useStore } from '../../store';
import { Radio, RadioGroup } from '../ui/radio';
import type { StatisticsBy } from '@/store/SettingsStore';

export default observer(function Statistics() {
  const { infomapStore, settingsStore } = useStore();
  return (
    <VStack w="100%" gap={4} align="start">
      {infomapStore.haveBioregions && <SelectStatisticsBy />}
      {infomapStore.haveBioregions &&
      settingsStore.statisticsBy === 'bioregions' ? (
        <Bioregions />
      ) : (
        <SpeciesList />
      )}
    </VStack>
  );
});

const SelectStatisticsBy = observer(() => {
  const { settingsStore } = useStore();
  return (
    <Flex>
      <Box mr={2}>Statistics by</Box>
      <RadioGroup
        onValueChange={(e) =>
          settingsStore.setStatisticsBy(e.value as StatisticsBy)
        }
        value={settingsStore.statisticsBy}
      >
        <HStack>
          <Radio value="species">Species</Radio>
          <Radio value="bioregions">Bioregions</Radio>
        </HStack>
      </RadioGroup>
    </Flex>
  );
});
