import { Button, Modal as ChakraModal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter, ModalProps } from "@chakra-ui/react";


type MyModalProps = {
  header: string;
} & ModalProps;

export default function Modal({ header, isOpen, onClose, children }: React.PropsWithChildren<MyModalProps>) {
  return (
    <ChakraModal onClose={onClose} size="xl" isOpen={isOpen}>
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
    </ChakraModal>
  )
}
