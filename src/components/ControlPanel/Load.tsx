import React, { HTMLProps, useState } from "react";
import { observer } from "mobx-react";
import { Button, Input, Collapse } from '@chakra-ui/react';
import { Table, Tr, Td, Tbody, Thead, Th, Tfoot } from '@chakra-ui/react';
import Modal from './Modal';
import { useStore } from '../../store';


type ExampleDataProps = {
  onClick?: (filename: string) => void;
}

const ExampleData = ({ onClick = () => null }: ExampleDataProps) => {
  const rowHover = {
    background: "var(--chakra-colors-gray-50)",
  };

  return (
    <Table size="sm" variant="simple">
      <Thead>
        <Tr>
          <Th>Description</Th>
          <Th textAlign="right">Size&nbsp;(Mb)</Th>
        </Tr>
      </Thead>
      <Tbody style={{ cursor: "pointer" }}>
        <Tr _hover={rowHover} onClick={() => onClick("/data/mammals_neotropics.csv")}>
          <Td>Mammals in the South American neotropics</Td>
          <Td isNumeric>2.8</Td>
        </Tr>
        <Tr _hover={rowHover} onClick={() => onClick("/data/mammals_global.csv")}>
          <Td>Global mammal occurrences</Td>
          <Td isNumeric>56</Td>
        </Tr>
      </Tbody>
    </Table>
  )
}

const LoadData = ({ onChange }: HTMLProps<HTMLInputElement>) => {
  return (
    <>
      <Button as="label" htmlFor="file-input">Load species data...</Button>
      <Input
        type="file"
        id="file-input"
        accept=".csv"
        visibility="hidden"
        onChange={onChange}
      />
    </>
  )
}

const Preview = ({ lines }: { lines: string[] }) => {
  const [header, ...rest] = lines;
  return (
    <Table size="sm" variant="simple">
      <Thead>
        <Tr>
          {header.split(",").map((cell, i) => <Th key={i}>{cell}</Th>)}
        </Tr>
      </Thead>
      <Tbody>
        {rest.map((line, i) => (
          <Tr key={i}>
            {line.split(",").map((cell, j) => (
              <Td key={j}>{cell}</Td>
            ))}
          </Tr>
        ))}
      </Tbody>
      <Tfoot>
        <Tr>
          <Td colSpan={3}>&hellip;</Td>
        </Tr>
      </Tfoot>
    </Table>
  )
}

export default observer(function Load() {
  const [isLoadModalOpen, setIsLoadModalOpen] = useState(false);
  const [isExampleDataOpen, setIsExampleDataOpen] = useState(true);
  const [file, setFile] = useState<File>();
  const [lines, setLines] = useState<string[]>([]);
  const { speciesStore, infomapStore } = useStore();

  const handleLoadDataChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.item(0);
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const lines = reader.result!.toString().split("\n");
        setLines(lines.slice(0, 5));
      }
      reader.readAsText(file);
      setFile(file);
      setIsExampleDataOpen(false);
    } else {
      // error
    }
  }

  const handleExampleDataClick = async (filename: string) => {
    setIsLoadModalOpen(false);
    await speciesStore.loadSpecies(filename);
    const cells = speciesStore.binner.cellsNonEmpty();
    await infomapStore.runInfomap(cells);
  }

  return (
    <>
      <Button onClick={() => setIsLoadModalOpen(true)}>Load</Button>
      <Modal header="Species data" isOpen={isLoadModalOpen} onClose={() => setIsLoadModalOpen(false)}>
        <LoadData onChange={handleLoadDataChange} />
        <Collapse in={isExampleDataOpen}>
          <ExampleData onClick={handleExampleDataClick} />
        </Collapse>
        <Collapse in={!isExampleDataOpen}>
          {file != null && file.name}
          {lines.length > 2 && <Preview lines={lines} />}
        </Collapse>
      </Modal>
    </>
  );
});