import { Box, Table, Thead, Tbody, Tr, Th, Td, Input } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { useStore } from '../../store';
import PieChart from './PieChart';

export default observer(function SpeciesList() {
  const { speciesStore } = useStore();

  if (speciesStore.numSpecies === 0) {
    return null;
  }

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
      <Table variant="simple">
        <Thead>
          <Tr>
            <Th colSpan={2}>
              <Input placeholder="Filter..." />
            </Th>
            <Th textAlign="start">{speciesStore.numSpecies}</Th>
          </Tr>
          <Tr>
            <Th>Name</Th>
            <Th isNumeric>Count</Th>
            <Th textAlign="center">Regions</Th>
          </Tr>
        </Thead>
        <Tbody>
          {speciesStore.speciesTopList.slice(0, 100).map((species) => {
            return (
              <Tr key={species.name} w="100%">
                <Td>{species.name}</Td>
                <Td isNumeric>{species.count.toLocaleString()}</Td>
                <Td>
                  <PieChart values={species.regions} />
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>
    </Box>
  );
});
