import { Table, Tag } from '@chakra-ui/react';
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
    <Table.Root width="100%" size="sm" variant="line">
      <Table.Header>
        <Table.Row>
          <Table.Cell></Table.Cell>
          <Table.Cell>Nodes</Table.Cell>
          <Table.Cell>Links</Table.Cell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        <Table.Row>
          <Table.Cell>Species</Table.Cell>
          <Table.Cell>
            <Tag.Root size="sm">
              <Tag.Label>
                {network.numLeafTaxonNodes.toLocaleString()}
              </Tag.Label>
            </Tag.Root>
          </Table.Cell>
          <Table.Cell>
            <Tag.Root size="sm">
              <Tag.Label>
                {network.numLeafTaxonLinks.toLocaleString()}
              </Tag.Label>
            </Tag.Root>
          </Table.Cell>
        </Table.Row>
        <Table.Row>
          <Table.Cell>Ancestors</Table.Cell>
          <Table.Cell>
            <Tag.Root size="sm">
              <Tag.Label>
                {network.numInternalTaxonNodes.toLocaleString()}
              </Tag.Label>
            </Tag.Root>
          </Table.Cell>
          <Table.Cell>
            <Tag.Root size="sm">
              <Tag.Label>
                {network.numInternalTaxonLinks.toLocaleString()}
              </Tag.Label>
            </Tag.Root>
          </Table.Cell>
        </Table.Row>
        <Table.Row>
          <Table.Cell>{gridLabel}</Table.Cell>
          <Table.Cell>
            <Tag.Root size="sm">
              <Tag.Label>{numGridCells}</Tag.Label>
            </Tag.Root>
          </Table.Cell>
          <Table.Cell></Table.Cell>
        </Table.Row>
      </Table.Body>
      <Table.Footer>
        <Table.Row>
          <Table.Cell>{totalLabel}</Table.Cell>
          <Table.Cell>
            <Tag.Root size="sm">
              <Tag.Label>{totalNumNodes}</Tag.Label>
            </Tag.Root>
          </Table.Cell>
          <Table.Cell>
            <Tag.Root size="sm">
              {network.links.length.toLocaleString()}
            </Tag.Root>
          </Table.Cell>
        </Table.Row>
      </Table.Footer>
    </Table.Root>
  );
}
