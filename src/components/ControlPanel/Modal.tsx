import {
  DialogBackdrop,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Dialog } from '@chakra-ui/react';

type MyModalProps = {
  header: string;
  footer?: React.ReactElement<any>;
} & Dialog.RootProps;

export default function Modal({
  header,
  footer,
  children,
  ...props
}: React.PropsWithChildren<MyModalProps>) {
  return (
    <DialogRoot {...props}>
      <DialogBackdrop />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{header}</DialogTitle>
        </DialogHeader>
        <DialogCloseTrigger />
        <DialogBody>{children}</DialogBody>
        <DialogFooter>{footer != null && footer}</DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}
