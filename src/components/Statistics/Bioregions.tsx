import { Box, Popover, Table, Text } from '@chakra-ui/react';
import {
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  PopoverHeader,
  PopoverRoot,
  PopoverTrigger,
} from '../ui/popover';
import { observer } from 'mobx-react';
import { format } from 'd3-format';
import { useStore } from '../../store';
import type { Bioregion } from '../../store/InfomapStore';
import { SpeciesPieChart } from './PieChart';
// import { InfoOutlineIcon } from '@chakra-ui/icons';
import { CiCircleInfo } from 'react-icons/ci';
import { useColorModeValue } from '../ui/color-mode';

const formatScore = format('.3r');
// const formatNumber = format(',');
// const format2s = format('.2r');
// const formatPercent = (value: number) => `${format2s(100 * value)}%`;

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
  const borderColor = useColorModeValue('blackAlpha.200', 'whiteAlpha.200');

  //const { mostCommon, mostIndicative } = useExampleData();

  const MAX_NUM_ROWS = 10;
  const numValues = Math.min(
    Math.min(bioregion.mostCommon.length, bioregion.mostIndicative.length),
    MAX_NUM_ROWS,
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

      <Table.Root variant="line">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader colSpan={3} textAlign="center">
              Most common species
            </Table.ColumnHeader>
            <Table.ColumnHeader colSpan={3} textAlign="center">
              <Text as="div" display="flex" alignItems="center">
                Most indicative species
                <PopoverRoot>
                  <PopoverTrigger>
                    <Box ml={2}>
                      <CiCircleInfo />
                    </Box>
                  </PopoverTrigger>
                  <PopoverContent textTransform="none">
                    <PopoverArrow />
                    <Popover.CloseTrigger />
                    <PopoverHeader>Most indicative species</PopoverHeader>
                    <PopoverBody fontWeight="normal">
                      The score of a species <em>s</em> in bioregion <em>r</em>{' '}
                      is defined as the relative abundance of <em>s</em> within{' '}
                      <em>r</em> divided by the relative abundance of <em>s</em>{' '}
                      in total.
                    </PopoverBody>
                  </PopoverContent>
                </PopoverRoot>
              </Text>
            </Table.ColumnHeader>
          </Table.Row>
          <Table.Row>
            <Table.ColumnHeader>Name</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="right">Count</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="right">Score</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="center">Regions</Table.ColumnHeader>
            <Table.ColumnHeader>Name</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="right">Count</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="right">Score</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="center">Regions</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {mostCommon.map(
            (
              commonSpecies: { name: string; count: number; score: number },
              index: number,
            ) => {
              const indicativeSpecies = mostIndicative[index]!;
              return (
                <Table.Row key={index} w="100%">
                  <Table.Cell>{commonSpecies.name}</Table.Cell>
                  <Table.Cell textAlign="right">
                    {commonSpecies.count.toLocaleString()}
                  </Table.Cell>
                  <Table.Cell textAlign="right">
                    {formatScore(commonSpecies.score)}
                  </Table.Cell>
                  <Table.Cell>
                    <SpeciesPieChart speciesName={commonSpecies.name} />
                  </Table.Cell>
                  <Table.Cell>{indicativeSpecies.name}</Table.Cell>
                  <Table.Cell textAlign="right">
                    {indicativeSpecies.count}
                  </Table.Cell>
                  <Table.Cell textAlign="right">
                    {formatScore(indicativeSpecies.score)}
                  </Table.Cell>
                  <Table.Cell>
                    <SpeciesPieChart speciesName={indicativeSpecies.name} />
                  </Table.Cell>
                </Table.Row>
              );
            },
          )}
        </Table.Body>
      </Table.Root>
    </Box>
  );
});
