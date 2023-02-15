import { observer } from 'mobx-react';
import {
  Box,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  Button,
} from '@chakra-ui/react';
import { useState } from 'react';
import { HexColorInput, HexColorPicker } from 'react-colorful';

// function newFunction(setShowWaterColor, showWaterColor: boolean, mapStore: MapStore, onChangeWaterColor: (value: any) => void) {

type Params = {
  color: string;
  onChange: (color: string) => void;
  label?: string;
};

export default observer(function ColorPicker({
  color,
  onChange,
  label,
}: Params) {
  const [isOpen, setIsOpen] = useState(false);
  const [tempColor, setTempColor] = useState(color);

  const onSave = () => {
    setIsOpen(false);
    onChange(tempColor);
  };

  const onCancel = () => {
    setIsOpen(false);
    setTempColor(color);
  };

  return (
    <Box>
      <Box
        onClick={() => setIsOpen(!isOpen)}
        bg={color}
        w={8}
        h={8}
        border="1px solid #dddddd"
      />

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{label || 'Pick a color'}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <HexColorPicker color={color} onChange={setTempColor} />
            <HexColorInput color={color} onChange={setTempColor} />
          </ModalBody>

          <ModalFooter>
            <Button
              colorScheme="blue"
              mr={3}
              onClick={onSave}
              disabled={color === tempColor}
            >
              Save
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
});
