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
import type { Example } from '../../store/ExampleStore';

const shpExtensions: string[] = ['shp', 'shx', 'dbf', 'prj'];

const guessColumnNames = (cols: string[]) => {
  const reName = /species|binomial|name/i;
  const reLat = /lat/i;
  const reLong = /lng|long/i;
  let name = '';
  let lat = '';
  let long = '';
  for (const col of cols) {
    console.log(col, name, !name, reName.test(col));
    if (!name && reName.test(col)) {
      name = col;
      continue;
    }
    if (!lat && reLat.test(col)) {
      lat = col;
      continue;
    }
    if (!long && reLong.test(col)) {
      long = col;
      continue;
    }
  }
  if (name === '') {
    name = cols[0];
  }
  if (lat === '') {
    lat = cols[1];
  }
  if (long === '') {
    long = cols[2];
  }
  return { name, lat, long };
};

export const LoadExample = observer(function LoadExample() {
  const store = useStore();
  const [isOpen, setIsOpen] = useState(false);
  const { speciesStore, exampleStore } = store;

  const rowHover = {
    background: 'var(--chakra-colors-gray-50)',
  };

  const loadExample = (example: Example) => {
    setIsOpen(false);
    exampleStore.loadExample(example);
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
              <Th textAlign="right">Size</Th>
            </Tr>
          </Thead>
          <Tbody style={{ cursor: 'pointer' }}>
            {exampleStore.examples.map((example) => (
              <Tr
                key={example.name}
                _hover={rowHover}
                onClick={() => loadExample(example)}
              >
                <Td>{example.name}</Td>
                <Td>{example.size}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Modal>
    </>
  );
});

export const LoadData = observer(function LoadData() {
  const { speciesStore, treeStore, infomapStore } = useStore();
  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<File>();
  const [header, setHeader] = useState<string[]>([]);
  const [lines, setLines] = useState<any[]>([]);

  const [nameColumn, setNameColumn] = useState<string>('');
  const [latColumn, setLatColumn] = useState<string>('');
  const [longColumn, setLongColumn] = useState<string>('');

  const setColumn = [setNameColumn, setLatColumn, setLongColumn];
  const values = [nameColumn, latColumn, longColumn];
  console.log(`name: ${nameColumn}, lat: ${latColumn}, long: ${longColumn}`);

  const onChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const { files } = event.target;
    if (!files || files.length === 0) {
      return;
    }

    infomapStore.setTree(null);

    let occurrenceData: File | null = null;
    let tree: File | null = null;
    let shpFiles: File[] = [];
    let zipFile: File | null = null;

    for (let file of files) {
      const fileExt = extension(file.name);

      if (['csv', 'tsv'].includes(fileExt) && occurrenceData === null) {
        occurrenceData = file;
      } else if (['nwk', 'tre', 'tree'].includes(fileExt)) {
        tree = file;
      } else if (shpExtensions.includes(fileExt)) {
        shpFiles.push(file);
      } else if (fileExt === 'zip') {
        zipFile = file;
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
        const { name, lat, long } = guessColumnNames(header);
        setNameColumn(name);
        setLatColumn(lat);
        setLongColumn(long);
        setLines(data);
      } catch (e) {
        console.error(e);
      }
    } else {
      // error
    }

    if (zipFile || shpFiles.length > 0) {
      await speciesStore.loadShapefile(zipFile ?? shpFiles);
    }
  };

  const onClose = () => {
    setIsOpen(false);
    setFile(undefined);
    setNameColumn('');
    setLatColumn('');
    setLongColumn('');
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
    onClose(); // cleanup state
  };

  const columns = ['name', 'latitude', 'longitude'] as const;
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
        accept={`.csv,.tsv,.nwk,.tre,.zip,${shpExtensions
          .map((ext) => `.${ext}`)
          .join(',')}`}
        multiple
        style={{ visibility: 'hidden', display: 'none' }}
        onChange={onChange}
      />

      <Modal
        header="Load data"
        isOpen={isOpen}
        onClose={onClose}
        scrollBehavior="inside"
        size="4xl"
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
                    value={values[i]}
                    onChange={(e) => setColumn[i](e.target.value)}
                  >
                    {header.map((cell, j) => (
                      <option value={cell} key={j}>
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
