import { Table, Thead, Tbody, Tr, Td, Tfoot, Tag } from '@chakra-ui/react';
import type {
  BioregionsNetwork,
  BioregionsStateNetwork,
} from '../../store/InfomapStore';

export default function NetworkSize({
  network,
}: {
  network: BioregionsNetwork | BioregionsStateNetwork | null;
}) {
  if (!network) return null;
  const haveStates = 'numStateGridCellNodes' in network;
  const gridLabel = haveStates ? 'Grid cells (states)' : 'Grid cells';
  const numGridCells = haveStates
    ? `${network.numGridCellNodes.toLocaleString()} (${network.numStateGridCellNodes.toLocaleString()})`
    : network.numGridCellNodes.toLocaleString();
  const totalLabel = haveStates ? 'Total (states)' : 'Total';
  const totalNumNodes = haveStates
    ? `${network.nodes.length.toLocaleString()} (${network.states.length.toLocaleString()})`
    : network.nodes.length.toLocaleString();

  return (
    <Table width="100%" size="sm" variant="simpler">
      <Thead>
        <Tr>
          <Td></Td>
          <Td>Nodes</Td>
          <Td>Links</Td>
        </Tr>
      </Thead>
      <Tbody>
        <Tr>
          <Td>Species</Td>
          <Td isNumeric>
            <Tag size="sm">{network.numLeafTaxonNodes.toLocaleString()}</Tag>
          </Td>
          <Td isNumeric>
            <Tag size="sm">{network.numLeafTaxonLinks.toLocaleString()}</Tag>
          </Td>
        </Tr>
        <Tr>
          <Td>Ancestors</Td>
          <Td isNumeric>
            <Tag size="sm">
              {network.numInternalTaxonNodes.toLocaleString()}
            </Tag>
          </Td>
          <Td isNumeric>
            <Tag size="sm">
              {network.numInternalTaxonLinks.toLocaleString()}
            </Tag>
          </Td>
        </Tr>
        <Tr>
          <Td>{gridLabel}</Td>
          <Td isNumeric>
            <Tag size="sm">{numGridCells}</Tag>
          </Td>
          <Td isNumeric></Td>
        </Tr>
      </Tbody>
      <Tfoot>
        <Tr>
          <Td>{totalLabel}</Td>
          <Td isNumeric>
            <Tag size="sm">{totalNumNodes}</Tag>
          </Td>
          <Td isNumeric>
            <Tag size="sm">{network.links.length.toLocaleString()}</Tag>
          </Td>
        </Tr>
      </Tfoot>
    </Table>
  );
}
