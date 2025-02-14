import { observer } from 'mobx-react';
import { Box, Button, DialogActionTrigger } from '@chakra-ui/react';
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
    <DialogRoot open={isOpen} onOpenChange={(e) => setIsOpen(e.open)}>
      <DialogTrigger asChild>
        <Button
          onClick={() => setIsOpen(!isOpen)}
          bg={color}
          w={8}
          h={8}
          border="1px solid #dddddd"
        />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label || 'Pick a color'}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <HexColorPicker color={color} onChange={setTempColor} />
          <HexColorInput color={color} onChange={setTempColor} />
        </DialogBody>

        <DialogFooter>
          <DialogActionTrigger asChild>
            <Button
              colorScheme="blue"
              mr={3}
              onClick={onSave}
              disabled={color === tempColor}
            >
              Save
            </Button>
          </DialogActionTrigger>
          <DialogActionTrigger asChild>
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </DialogActionTrigger>
        </DialogFooter>
        <DialogCloseTrigger />
      </DialogContent>
    </DialogRoot>
  );
});
