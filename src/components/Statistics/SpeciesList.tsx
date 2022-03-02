import {
  Box,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Input,
  Text,
  useColorModeValue,
} from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { useState } from 'react';
import { useStore } from '../../store';
import PieChart from './PieChart';

export default observer(function SpeciesList() {
  const [filter, setFilter] = useState('');
  const { speciesStore } = useStore();
  const borderColor = useColorModeValue('blackAlpha.200', 'whiteAlpha.200');

  if (speciesStore.numSpecies === 0) {
    return null;
  }

  const match = filter ? new RegExp(filter) : null;

  let items = speciesStore.speciesTopList;
  if (match) {
    items = items.filter(({ name }) => match.test(name));
  }
  items = items.slice(0, 100);

  return (
    <Box
      p={4}
      w="100%"
      rounded="md"
      borderColor={borderColor}
      borderWidth="2px"
      boxShadow="md"
    >
      <Table variant="simple">
        <Thead>
          <Tr>
            <Th colSpan={2}>
              <Input
                placeholder="Filter species..."
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />
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
          {items.map((species) => {
            return (
              <Tr key={species.name} w="100%">
                <Td>
                  <Text>{species.name}</Text>
                </Td>
                <Td isNumeric>{species.count.toLocaleString()}</Td>
                <Td>
                  <PieChart values={species.countPerRegion.entries()} />
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>
    </Box>
  );
});
