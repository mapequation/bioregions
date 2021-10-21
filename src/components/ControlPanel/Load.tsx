import React, { useState } from "react";
import { Button, Tag, Select, Icon } from '@chakra-ui/react';
import { BsArrowRight } from 'react-icons/bs';
import { FiUpload } from 'react-icons/fi';
import { Table, Tr, Td, Tbody, Thead, Th, Tfoot, TableCaption } from '@chakra-ui/react';
import Modal from './Modal';
import { useStore } from '../../store';
import { loadPreview } from '../../utils/loader';


export const LoadExample = function () {
  const { speciesStore, infomapStore, treeStore } = useStore();
  const [isOpen, setIsOpen] = useState(false);

  const rowHover = {
    background: "var(--chakra-colors-gray-50)",
  };

  const loadFile = (filename: string, treename?: string) => async () => {
    setIsOpen(false);
    await speciesStore.load(filename);
    if (treename) {
      await treeStore.loadTree(treename);
    }
    await infomapStore.run();
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
            <Tr _hover={rowHover} onClick={loadFile("/data/mammals_neotropics.csv", "/data/mammals_neotropics.nwk")}>
              <Td>Mammals in the South American neotropics</Td>
              <Td isNumeric>2.8</Td>
            </Tr>
            <Tr _hover={rowHover} onClick={loadFile("/data/mammals_global.csv")}>
              <Td>Global mammal occurrences</Td>
              <Td isNumeric>56</Td>
            </Tr>
          </Tbody>
        </Table>
      </Modal>
    </>
  );
};


export const LoadData = function () {
  const { speciesStore, infomapStore } = useStore();
  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<File>();
  const [header, setHeader] = useState<string[]>([]);
  const [lines, setLines] = useState<any[]>([]);

  const [nameColumn, setNameColumn] = useState<string>("");
  const [longColumn, setLongColumn] = useState<string>("");
  const [latColumn, setLatColumn] = useState<string>("");

  const setColumn = [setNameColumn, setLongColumn, setLatColumn];

  const onChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setIsOpen(true);

    const file = event.target.files?.item(0);

    if (file) {
      try {
        const { data, header } = await loadPreview(file);
        setFile(file);
        setHeader(header);
        setNameColumn(header[0]);
        setLongColumn(header[1]);
        setLatColumn(header[2]);
        setLines(data);
      } catch (e) {
        console.error(e);
      }

    } else {
      // error
    }
  }

  const onClose = () => {
    setIsOpen(false);
    setFile(undefined);
    setNameColumn("");
    setLongColumn("");
    setLatColumn("");
    setHeader([]);
    setLines([]);
  }

  const onSubmit = async () => {
    if (!file) {
      console.error("No file!")
      return;
    }

    setIsOpen(false);
    await speciesStore.load(file, nameColumn, longColumn, latColumn);
    await infomapStore.run();
    onClose(); // cleanup state
  }

  const columns = ["name", "longitude", "latitude"] as const;
  const visibleRows = 5;

  return (
    <>
      <Button leftIcon={<FiUpload />} size="sm" as="label" htmlFor="file-input">Load data...</Button>
      <input
        type="file"
        id="file-input"
        accept=".csv,.tsv"
        style={{ visibility: "hidden", display: "none" }}
        onChange={onChange}
      />

      <Modal
        header="Load data"
        isOpen={isOpen}
        onClose={onClose}
        footer={<Button children={"Finish"} onClick={onSubmit} />}
      >
        <Table size="sm" variant="simple">
          <TableCaption placement="top">File preview</TableCaption>
          <Thead>
            <Tr>
              {header.map((cell, i) => <Th key={i}>{cell}</Th>)}
            </Tr>
          </Thead>
          <Tbody>
            {lines.slice(0, visibleRows).map((_, i) => (
              <Tr key={i}>
                {header.map(field => (
                  <Td key={field}>{lines[i][field]}</Td>
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
                  <Select size="sm" value={i} onChange={(e) => setColumn[i](header[+e.target.value])}>
                    {header.map((cell, j) => (
                      <option value={j} key={j}>{cell}</option>
                    ))}
                  </Select>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Modal>
    </>
  );
};