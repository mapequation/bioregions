import React, { useState } from 'react';
import { observer } from 'mobx-react';
import { Button, Tag, Select, Icon } from '@chakra-ui/react';
import { BsArrowRight } from 'react-icons/bs';
import { FiUpload } from 'react-icons/fi';
import {
  Table,
  Tr,
  Td,
  Tbody,
  Thead,
  Th,
  Tfoot,
  TableCaption,
} from '@chakra-ui/react';
import Modal from './Modal';
import { useStore } from '../../store';
import { loadPreview } from '../../utils/loader';
import { extension } from '../../utils/filename';

export const LoadExample = observer(function LoadExample() {
  const { speciesStore, infomapStore, treeStore, mapStore } = useStore();
  const [isOpen, setIsOpen] = useState(false);

  const rowHover = {
    background: 'var(--chakra-colors-gray-50)',
  };

  const loadFile = (filename: string, treename?: string) => async () => {
    setIsOpen(false);
    speciesStore.setLoaded(false);
    treeStore.setLoaded(false);
    treeStore.setTree(null);
    infomapStore.setTree(null);

    if (treename) {
      await treeStore.load(treename);
    }
    await speciesStore.load(filename);
    await infomapStore.run();

    mapStore.setRenderType('bioregions');
    mapStore.render();
  };

  return (
    <>
      <Button
        isDisabled={speciesStore.isLoading}
        size="sm"
        onClick={() => setIsOpen(true)}
      >
        Load examples
      </Button>

      <Modal
        header="Example Data"
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      >
        <Table size="sm" variant="simple">
          <Thead>
            <Tr>
              <Th>Description</Th>
              <Th textAlign="right">Size&nbsp;(Mb)</Th>
            </Tr>
          </Thead>
          <Tbody style={{ cursor: 'pointer' }}>
            <Tr
              _hover={rowHover}
              onClick={loadFile(
                '/data/mammals_neotropics.csv',
                '/data/mammals_neotropics.nwk',
              )}
            >
              <Td>Mammals in the South American neotropics</Td>
              <Td isNumeric>2.8</Td>
            </Tr>
            <Tr
              _hover={rowHover}
              onClick={loadFile('/data/mammals_global.tsv')}
            >
              <Td>Global mammal occurrences</Td>
              <Td isNumeric>56</Td>
            </Tr>
          </Tbody>
        </Table>
      </Modal>
    </>
  );
});

export const LoadData = observer(function LoadData() {
  const { speciesStore, treeStore, infomapStore, mapStore } = useStore();
  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<File>();
  const [header, setHeader] = useState<string[]>([]);
  const [lines, setLines] = useState<any[]>([]);

  const [nameColumn, setNameColumn] = useState<string>('');
  const [longColumn, setLongColumn] = useState<string>('');
  const [latColumn, setLatColumn] = useState<string>('');

  const setColumn = [setNameColumn, setLongColumn, setLatColumn];

  const onChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const { files } = event.target;
    if (!files || files.length === 0) {
      return;
    }

    speciesStore.setLoaded(false);
    treeStore.setLoaded(false);
    treeStore.setTree(null);
    infomapStore.setTree(null);

    let occurrenceData: File | null = null;
    let tree: File | null = null;

    for (let file of files) {
      const fileExt = extension(file.name);

      if (['csv', 'tsv'].includes(fileExt) && occurrenceData === null) {
        occurrenceData = file;
      } else if (fileExt === 'nwk') {
        tree = file;
      }
    }

    if (tree) {
      await treeStore.load(tree);
    }

    if (occurrenceData) {
      setIsOpen(true);

      try {
        const { data, header } = await loadPreview(occurrenceData);
        setFile(occurrenceData);
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
  };

  const onClose = () => {
    setIsOpen(false);
    setFile(undefined);
    setNameColumn('');
    setLongColumn('');
    setLatColumn('');
    setHeader([]);
    setLines([]);
  };

  const onSubmit = async () => {
    if (!file) {
      console.error('No file!');
      return;
    }

    setIsOpen(false);
    await speciesStore.load(file, nameColumn, longColumn, latColumn);
    await infomapStore.run();
    mapStore.setRenderType('bioregions');
    mapStore.render();
    onClose(); // cleanup state
  };

  const columns = ['name', 'longitude', 'latitude'] as const;
  const visibleRows = 5;

  return (
    <>
      <Button
        isDisabled={speciesStore.isLoading}
        leftIcon={<FiUpload />}
        size="sm"
        as="label"
        htmlFor="file-input"
      >
        Load data...
      </Button>
      <input
        type="file"
        id="file-input"
        accept=".csv,.tsv,.nwk"
        multiple
        style={{ visibility: 'hidden', display: 'none' }}
        onChange={onChange}
      />

      <Modal
        header="Load data"
        isOpen={isOpen}
        onClose={onClose}
        footer={<Button children={'Finish'} onClick={onSubmit} />}
      >
        <Table size="sm" variant="simple">
          <TableCaption placement="top">File preview</TableCaption>
          <Thead>
            <Tr>
              {header.map((cell, i) => (
                <Th key={i}>{cell}</Th>
              ))}
            </Tr>
          </Thead>
          <Tbody>
            {lines.slice(0, visibleRows).map((_, i) => (
              <Tr key={i}>
                {header.map((field) => (
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
                <Td>
                  <Tag textTransform="capitalize">{column}</Tag>
                </Td>
                <Td>
                  <Icon as={BsArrowRight} />
                </Td>
                <Td>
                  <Select
                    size="sm"
                    value={i}
                    onChange={(e) => setColumn[i](header[+e.target.value])}
                  >
                    {header.map((cell, j) => (
                      <option value={j} key={j}>
                        {cell}
                      </option>
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
});
