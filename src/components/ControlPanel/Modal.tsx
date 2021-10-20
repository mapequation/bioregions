import { Modal as ChakraModal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter, ModalProps } from "@chakra-ui/react";


type MyModalProps = {
  header: string;
  footer?: React.ReactComponentElement<any>;
} & ModalProps;

export default function Modal({ header, isOpen, onClose, footer, children }: React.PropsWithChildren<MyModalProps>) {
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
          {footer != null && footer}
        </ModalFooter>
      </ModalContent>
    </ChakraModal>
  )
}
