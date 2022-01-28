import {
  Box,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  useColorModeValue,
} from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { useStore } from '../../store';
import type { Bioregion } from '../../store/InfomapStore';
import PieChart from './PieChart';

export default observer(function Bioregions() {
  const { infomapStore } = useStore();

  if (infomapStore.numBioregions === 0) {
    return null;
  }

  return (
    <>
      {infomapStore.bioregions.map((bioregion: Bioregion) => (
        <BioregionInfo bioregion={bioregion} key={bioregion.bioregionId} />
      ))}
    </>
  );
});

const BioregionInfo = observer(function Bioregion({
  bioregion,
}: {
  bioregion: Bioregion;
}) {
  const { colorStore, speciesStore } = useStore();
  const { colorBioregion } = colorStore;
  const borderColor = useColorModeValue('blackAlpha.200', 'whiteAlpha.200');

  //const { mostCommon, mostIndicative } = useExampleData();

  const numValues = Math.min(
    Math.min(bioregion.mostCommon.length, bioregion.mostIndicative.length),
    9,
  );

  const mostCommon = bioregion.mostCommon.slice(0, numValues);
  const mostIndicative = bioregion.mostIndicative.slice(0, numValues);

  return (
    <Box
      p={4}
      w="100%"
      rounded="md"
      borderColor={borderColor}
      borderWidth="2px"
      boxShadow="md"
    >
      <Box
        bg={colorBioregion(bioregion.bioregionId)}
        w="100%"
        h="100%"
        rounded="md"
        textAlign="center"
        color="white"
        borderColor="blackAlpha.200"
        borderWidth="2px"
        fontWeight={600}
        py={2}
        textShadow="1px 1px 2px var(--chakra-colors-blackAlpha-700)"
      >
        Bioregion {bioregion.bioregionId}
      </Box>

      <Table variant="simple">
        <Thead>
          <Tr>
            <Th colSpan={3} textAlign="center">
              Most common species
            </Th>
            <Th colSpan={3} textAlign="center">
              Most indicative species
            </Th>
          </Tr>
          <Tr>
            <Th>Name</Th>
            <Th isNumeric>Count</Th>
            <Th textAlign="center">Regions</Th>
            <Th>Name</Th>
            <Th isNumeric>Score</Th>
            <Th textAlign="center">Regions</Th>
          </Tr>
        </Thead>
        <Tbody>
          {mostCommon.map((commonSpecies: any, index: number) => {
            const indicativeSpecies = mostIndicative[index];
            return (
              <Tr key={index} w="100%">
                <Td>{commonSpecies.name}</Td>
                <Td isNumeric>{commonSpecies.count.toLocaleString()}</Td>
                <Td>
                  <PieChart
                    values={speciesStore.speciesMap
                      .get(commonSpecies.name)!
                      .countPerRegion.entries()}
                  />
                </Td>
                <Td>{indicativeSpecies?.name}</Td>
                <Td isNumeric>{indicativeSpecies?.score.toFixed(2)}</Td>
                <Td>
                  <PieChart
                    values={speciesStore.speciesMap
                      .get(indicativeSpecies?.name)!
                      .countPerRegion.entries()}
                  />
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>
    </Box>
  );
});

function useExampleData() {
  const mostCommon = [
    {
      name: 'lorem impsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua',
      count: 123,
    },
    {
      name: 'ipsum',
      count: 456,
    },
    {
      name: 'dolor',
      count: 789,
    },
    {
      name: 'sit',
      count: 102,
    },
    {
      name: 'amet',
      count: 15,
    },
    {
      name: 'consectetur',
      count: 18,
    },
    {
      name: 'adipiscing',
      count: 19,
    },
    {
      name: 'elit',
      count: 22,
    },
    {
      name: 'sed',
      count: 25,
    },
  ].sort((a, b) => b.count - a.count);

  const mostIndicative = [
    {
      name: 'lorem',
      score: 2.23,
    },
    {
      name: 'ipsum',
      score: 1.23,
    },
    {
      name: 'dolor',
      score: 0.23,
    },
    {
      name: 'sit',
      score: 3.23,
    },
    {
      name: 'amet',
      score: 4.23,
    },
    {
      name: 'consectetur',
      score: 5.23,
    },
    {
      name: 'adipiscing',
      score: 6.23,
    },
    {
      name: 'elit',
      score: 7.23,
    },
    {
      name: 'sed',
      score: 8.23,
    },
  ].sort((a, b) => b.score - a.score);

  return { mostCommon, mostIndicative };
}
