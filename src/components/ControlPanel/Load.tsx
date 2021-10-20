import React, { useState } from "react";
import { observer } from "mobx-react";
import { Button, Skeleton, Tag, Select, Icon } from '@chakra-ui/react';
import { BsArrowRight } from 'react-icons/bs';
import { FiUpload } from 'react-icons/fi';
import { Table, Tr, Td, Tbody, Thead, Th, Tfoot, TableCaption } from '@chakra-ui/react';
import Modal from './Modal';
import { useStore } from '../../store';


export const LoadExample = observer(function () {
  const [isOpen, setIsOpen] = useState(false);
  const { speciesStore, infomapStore } = useStore();

  const rowHover = {
    background: "var(--chakra-colors-gray-50)",
  };

  const handleExampleDataClick = (filename: string) => async () => {
    setIsOpen(false);
    await speciesStore.loadSpecies(filename);
    const cells = speciesStore.binner.cellsNonEmpty();
    await infomapStore.runInfomap(cells);
  }

  return (
    <>
      <Button size="sm" onClick={() => setIsOpen(true)}>Load examples</Button>

      <Modal header="Example Data" isOpen={isOpen} onClose={() => setIsOpen(false)}>
        <Table size="sm" variant="simple">
          <Thead>
            <Tr>
              <Th>Description</Th>
              <Th textAlign="right">Size&nbsp;(Mb)</Th>
            </Tr>
          </Thead>
          <Tbody style={{ cursor: "pointer" }}>
            <Tr _hover={rowHover} onClick={handleExampleDataClick("/data/mammals_neotropics.csv")}>
              <Td>Mammals in the South American neotropics</Td>
              <Td isNumeric>2.8</Td>
            </Tr>
            <Tr _hover={rowHover} onClick={handleExampleDataClick("/data/mammals_global.csv")}>
              <Td>Global mammal occurrences</Td>
              <Td isNumeric>56</Td>
            </Tr>
          </Tbody>
        </Table>
      </Modal>
    </>
  );
});


export const LoadData = observer(function () {
  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<File>();
  const [header, setHeader] = useState<string[]>([]);
  const [lines, setLines] = useState<string[][]>([]);

  const handleLoadDataChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setIsOpen(true);

    const file = event.target.files?.item(0);

    if (file) {
      const reader = new FileReader();

      reader.onload = () => {
        const lines = reader.result!.toString().split("\n");
        const [header, ...rest] = lines;
        setFile(file);
        setHeader(header.split(','));
        setLines(rest.map(line => line.split(',')));
      }

      reader.readAsText(file);
    } else {
      // error
    }
  }

  const onClose = () => {
    setIsOpen(false);
    setFile(undefined);
    setHeader([]);
    setLines([]);
  }

  const columns = ["name", "longitude", "latitude"] as const;

  return (
    <>
      <Button leftIcon={<FiUpload />} size="sm" as="label" htmlFor="file-input">Load data...</Button>
      <input
        type="file"
        id="file-input"
        accept=".csv"
        style={{ visibility: "hidden", display: "none" }}
        onChange={handleLoadDataChange}
      />

      <Modal header="Load data" isOpen={isOpen} onClose={onClose}>
        <Skeleton isLoaded={lines.length > 1}>
          <Table size="sm" variant="simple">
            <TableCaption placement="top">File preview</TableCaption>
            <Thead>
              <Tr>
                {header.map((cell, i) => <Th key={i}>{cell}</Th>)}
              </Tr>
            </Thead>
            <Tbody>
              {lines.slice(0, 5).map((line, i) => (
                <Tr key={i}>
                  {line.map((cell, j) => (
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

          <Table size="sm" variant="simple">
            <TableCaption placement="top">Map data columns</TableCaption>
            <Thead>
              <Tr>
                <Th colSpan={2}>Column</Th>
                <Th>Data</Th>
              </Tr>
            </Thead>
            <Tbody>
              {columns.map((column, i) => (
                <Tr key={i}>
                  <Td><Tag textTransform="capitalize">{column}</Tag></Td>
                  <Td><Icon as={BsArrowRight} /></Td>
                  <Td>
                    <Select size="sm">
                      {header.map((cell, j) => (
                        <option value={cell} key={j} selected={i === j}>{cell}</option>
                      ))}
                    </Select>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Skeleton>
      </Modal>
    </>
  );
});