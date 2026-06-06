import { Button, ButtonGroup } from '@chakra-ui/react';
import type { BackendType } from '@mapequation/d3gl/map';
import { BACKENDS } from '../store/MapStore';

type BackendSelectProps = {
  value: BackendType;
  onChange: (backend: BackendType) => void;
};

/** A tiny top-left overlay to switch a d3gl view's rendering backend. */
export default function BackendSelect({ value, onChange }: BackendSelectProps) {
  return (
    <ButtonGroup
      attached
      size="xs"
      variant="outline"
      position="absolute"
      top={1}
      left={1}
      zIndex={1}
      bg="bg.panel"
      borderRadius="sm"
      boxShadow="xs"
    >
      {BACKENDS.map((backend) => (
        <Button
          key={backend}
          variant={value === backend ? 'solid' : 'outline'}
          onClick={() => onChange(backend)}
        >
          {backend}
        </Button>
      ))}
    </ButtonGroup>
  );
}
