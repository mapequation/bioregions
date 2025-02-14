import { Box, Table, Input, Text } from '@chakra-ui/react';
import { useColorModeValue } from '../ui/color-mode';
import { observer } from 'mobx-react';
import { useState } from 'react';
import { useStore } from '../../store';
import { SpeciesPieChart } from './PieChart';

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
      <Table.Root variant="line">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader colSpan={2}>
              <Input
                placeholder="Filter species..."
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />
            </Table.ColumnHeader>
            <Table.ColumnHeader textAlign="start">
              {speciesStore.numSpecies}
            </Table.ColumnHeader>
          </Table.Row>
          <Table.Row>
            <Table.ColumnHeader>Name</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="right">Count</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="center">Regions</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {items.map((species) => {
            return (
              <Table.Row key={species.name} w="100%">
                <Table.Cell>
                  <Text>{species.name}</Text>
                </Table.Cell>
                <Table.Cell textAlign="right">
                  {species.count.toLocaleString()}
                </Table.Cell>
                <Table.Cell>
                  <SpeciesPieChart speciesName={species.name} />
                </Table.Cell>
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table.Root>
    </Box>
  );
});
