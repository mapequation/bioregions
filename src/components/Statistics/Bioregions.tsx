import { Box, Table, Thead, Tbody, Tr, Th, Td } from '@chakra-ui/react';
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
  const { colorStore } = useStore();
  const { colorBioregion } = colorStore;

  //const { mostCommon, mostIndicative } = useExampleData();

  const mostCommon = bioregion.mostCommon.slice(0, 9);
  const mostIndicative = bioregion.mostIndicative.slice(0, 9);

  return (
    <Box
      p={4}
      w="100%"
      bg="white"
      rounded="md"
      borderColor="blackAlpha.200"
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
                  <PieChart values={commonSpecies.regions} />
                </Td>
                <Td>{indicativeSpecies?.name}</Td>
                <Td isNumeric>{indicativeSpecies?.score.toFixed(2)}</Td>
                <Td>
                  <PieChart values={indicativeSpecies?.regions} />
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
      regions: [
        { id: 1, fraction: 0.2 },
        { id: 2, fraction: 0.3 },
        { id: 3, fraction: 0.5 },
        { id: 4, fraction: 0.5 },
        { id: 5, fraction: 0.1 },
        { id: 6, fraction: 0.1 },
        { id: 7, fraction: 0.1 },
        { id: 8, fraction: 0.1 },
        { id: 9, fraction: 0.1 },
        { id: 10, fraction: 0.1 },
      ],
    },
    {
      name: 'ipsum',
      count: 456,
      regions: [{ id: 5, fraction: 1 }],
    },
    {
      name: 'dolor',
      count: 789,
      regions: [
        { id: 4, fraction: 0.7 },
        { id: 2, fraction: 0.3 },
        { id: 3, fraction: 0.5 },
      ],
    },
    {
      name: 'sit',
      count: 102,
      regions: [
        { id: 1, fraction: 0.2 },
        { id: 2, fraction: 0.3 },
        { id: 3, fraction: 0.5 },
      ],
    },
    {
      name: 'amet',
      count: 15,
      regions: [
        { id: 1, fraction: 0.2 },
        { id: 2, fraction: 0.3 },
        { id: 3, fraction: 0.5 },
      ],
    },
    {
      name: 'consectetur',
      count: 18,
      regions: [
        { id: 1, fraction: 0.2 },
        { id: 2, fraction: 0.3 },
        { id: 3, fraction: 0.5 },
      ],
    },
    {
      name: 'adipiscing',
      count: 19,
      regions: [
        { id: 1, fraction: 0.2 },
        { id: 2, fraction: 0.3 },
        { id: 3, fraction: 0.5 },
      ],
    },
    {
      name: 'elit',
      count: 22,
      regions: [
        { id: 1, fraction: 0.2 },
        { id: 2, fraction: 0.3 },
        { id: 3, fraction: 0.5 },
      ],
    },
    {
      name: 'sed',
      count: 25,
      regions: [
        { id: 1, fraction: 0.2 },
        { id: 2, fraction: 0.3 },
        { id: 3, fraction: 0.5 },
      ],
    },
  ].sort((a, b) => b.count - a.count);

  const mostIndicative = [
    {
      name: 'lorem',
      score: 2.23,
      regions: [
        { id: 1, fraction: 0.2 },
        { id: 2, fraction: 0.3 },
        { id: 3, fraction: 0.5 },
      ],
    },
    {
      name: 'ipsum',
      score: 1.23,
      regions: [
        { id: 1, fraction: 0.2 },
        { id: 2, fraction: 0.3 },
        { id: 3, fraction: 0.5 },
      ],
    },
    {
      name: 'dolor',
      score: 0.23,
      regions: [
        { id: 1, fraction: 0.2 },
        { id: 2, fraction: 0.3 },
        { id: 3, fraction: 0.5 },
      ],
    },
    {
      name: 'sit',
      score: 3.23,
      regions: [
        { id: 1, fraction: 0.2 },
        { id: 2, fraction: 0.3 },
        { id: 3, fraction: 0.5 },
      ],
    },
    {
      name: 'amet',
      score: 4.23,
      regions: [
        { id: 1, fraction: 0.2 },
        { id: 2, fraction: 0.3 },
        { id: 3, fraction: 0.5 },
      ],
    },
    {
      name: 'consectetur',
      score: 5.23,
      regions: [
        { id: 1, fraction: 0.2 },
        { id: 2, fraction: 0.3 },
        { id: 3, fraction: 0.5 },
      ],
    },
    {
      name: 'adipiscing',
      score: 6.23,
      regions: [
        { id: 1, fraction: 0.2 },
        { id: 2, fraction: 0.3 },
        { id: 3, fraction: 0.5 },
      ],
    },
    {
      name: 'elit',
      score: 7.23,
      regions: [
        { id: 1, fraction: 0.2 },
        { id: 2, fraction: 0.3 },
        { id: 3, fraction: 0.5 },
      ],
    },
    {
      name: 'sed',
      score: 8.23,
      regions: [
        { id: 1, fraction: 0.2 },
        { id: 2, fraction: 0.3 },
        { id: 3, fraction: 0.5 },
      ],
    },
  ].sort((a, b) => b.score - a.score);

  return { mostCommon, mostIndicative };
}
