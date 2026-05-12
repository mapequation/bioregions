import { useState } from 'react';
import { observer } from 'mobx-react';
import {
  Tag,
  Icon,
  Button,
  FileUploadFileAcceptDetails,
} from '@chakra-ui/react';
import { BsArrowRight } from 'react-icons/bs';
import { FiUpload } from 'react-icons/fi';
import { Table } from '@chakra-ui/react';
import Modal from './Modal';
import { useStore } from '../../store';
import { loadPreview } from '../../utils/loader';
import { extension } from '../../utils/filename';
import type { Example } from '../../store/ExampleStore';
import Select from './Select';
import {
  FileUploadList,
  FileUploadRoot,
  FileUploadTrigger,
} from '@/components/ui/file-upload';

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

  const onFileChange = async (details: FileUploadFileAcceptDetails) => {
    const { files } = details;

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
      <FileUploadRoot
        disabled={speciesStore.isLoading}
        accept={`.csv,.tsv,.nwk,.tre,.zip,${shpExtensions
          .map((ext) => `.${ext}`)
          .join(',')}`}
        maxFiles={100}
        onFileAccept={onFileChange}
      >
        <FileUploadTrigger width="100%">
          <Button size="sm" as="div" width="100%" variant="surface">
            <FiUpload /> Load data...
          </Button>
        </FileUploadTrigger>
        <FileUploadList />
      </FileUploadRoot>

      <Modal
        header="Load data"
        open={isOpen}
        onOpenChange={onClose}
        scrollBehavior="inside"
        size="xl"
        footer={<Button children={'Finish'} onClick={onSubmit} />}
      >
        <Table.Root size="sm" variant="line">
          <Table.Caption>File preview</Table.Caption>
          <Table.Header>
            <Table.Row>
              {header.map((cell, i) => (
                <Table.ColumnHeader key={i}>{cell}</Table.ColumnHeader>
              ))}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {lines.slice(0, visibleRows).map((_, i) => (
              <Table.Row key={i}>
                {header.map((field) => (
                  <Table.Cell key={field}>{lines[i][field]}</Table.Cell>
                ))}
              </Table.Row>
            ))}
          </Table.Body>
          <Table.Footer>
            <Table.Row>
              <Table.Cell colSpan={3}>&hellip;</Table.Cell>
            </Table.Row>
          </Table.Footer>
        </Table.Root>

        <Table.Root size="sm" variant="line">
          <Table.Caption>Map data columns</Table.Caption>
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader colSpan={2}>Column</Table.ColumnHeader>
              <Table.ColumnHeader>Data</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {columns.map((column, i) => (
              <Table.Row key={i}>
                <Table.Cell>
                  <Tag.Root textTransform="capitalize">
                    <Tag.Label>{column}</Tag.Label>
                  </Tag.Root>
                </Table.Cell>
                <Table.Cell>
                  <Icon as={BsArrowRight} />
                </Table.Cell>
                <Table.Cell>
                  <Select
                    size="sm"
                    label=""
                    value={[values[i]]}
                    onValueChange={(e) => setColumn[i](e.value[0])}
                    items={header.map((cell) => ({ label: cell, value: cell }))}
                  ></Select>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Modal>
    </>
  );
});

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
        disabled={speciesStore.isLoading}
        size="sm"
        onClick={() => setIsOpen(true)}
        variant="outline"
      >
        Load examples
      </Button>

      <Modal
        header="Example Data"
        open={isOpen}
        onOpenChange={(e) => setIsOpen(e.open)}
      >
        <Table.Root size="sm" variant="line">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>Description</Table.ColumnHeader>
              <Table.ColumnHeader textAlign="right">Size</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body style={{ cursor: 'pointer' }}>
            {exampleStore.examples.map((example) => (
              <Table.Row
                key={example.name}
                _hover={rowHover}
                onClick={() => loadExample(example)}
              >
                <Table.Cell>{example.name}</Table.Cell>
                <Table.Cell>{example.size}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Modal>
    </>
  );
});
