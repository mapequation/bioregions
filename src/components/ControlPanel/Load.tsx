import React, { HTMLProps, useState } from "react";
import { observer } from "mobx-react";
import { Button, Input } from '@chakra-ui/react';
import { Table, Tr, Td, Tbody, Thead, Th } from '@chakra-ui/react';
import { Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter, ModalProps } from "@chakra-ui/react";
import { useStore } from '../../store';


type MyModalProps = {
  header: string;
} & ModalProps;

const MyModal = ({ header, isOpen, onClose, children }: React.PropsWithChildren<MyModalProps>) => {
  return (
    <Modal onClose={onClose} size="xl" isOpen={isOpen}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{header}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          {children}
        </ModalBody>
        <ModalFooter>
          <Button onClick={onClose}>Close</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

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

export default observer(function Load() {
  const [isLoadModalOpen, setIsLoadModalOpen] = useState(false);
  const [isDataModalOpen, setIsDataModalOpen] = useState(false);
  const { speciesStore, infomapStore } = useStore();

  const handleLoadDataChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.item(0);
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const data = reader.result as string;
        console.log(data);
      };
      reader.readAsText(file);
      setIsLoadModalOpen(false);
      setIsDataModalOpen(true);
    } else {
      // error
    }
  }

  const handleExampleDataClick = async (filename: string) => {
    console.log(filename);
    setIsLoadModalOpen(false);
    await speciesStore.loadSpecies(filename);
    const cells = speciesStore.binner.cellsNonEmpty();
    await infomapStore.runInfomap(cells);
  }

  return (
    <>
      <Button onClick={() => setIsLoadModalOpen(true)}>Load</Button>
      <MyModal header="Species data" isOpen={isLoadModalOpen} onClose={() => setIsLoadModalOpen(false)}>
        <LoadData onChange={handleLoadDataChange} />
        <ExampleData onClick={handleExampleDataClick} />
      </MyModal>
    </>
  );
});