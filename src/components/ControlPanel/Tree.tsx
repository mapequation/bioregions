import { observer } from 'mobx-react';
import { Button, ButtonGroup, Field, Flex, Spacer, VStack } from '@chakra-ui/react';
import { useStore } from '../../store';
import type {
  LayoutMode,
  CurveMode,
  SizeMode,
} from '../../utils/tree/treeLayout';

const LAYOUTS: LayoutMode[] = ['rectangular', 'radial'];
const CURVES: CurveMode[] = ['linear', 'step', 'bump'];
const COORDS: SizeMode[] = ['screen', 'world'];

type OptionRowProps<T extends string> = {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
};

function OptionRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: OptionRowProps<T>) {
  return (
    <Field.Root display="flex" flexDir="row" w="100%" alignItems="center">
      <Field.Label mb="0">{label}</Field.Label>
      <Spacer />
      <ButtonGroup attached size="xs" variant="outline">
        {options.map((option) => (
          <Button
            key={option}
            variant={value === option ? 'solid' : 'outline'}
            onClick={() => onChange(option)}
            textTransform="capitalize"
          >
            {option}
          </Button>
        ))}
      </ButtonGroup>
    </Field.Root>
  );
}

export default observer(function Tree() {
  const { treeStore } = useStore();

  return (
    <VStack align="stretch">
      <Flex w="100%">
        <OptionRow
          label="Layout"
          options={LAYOUTS}
          value={treeStore.layout}
          onChange={treeStore.setLayout}
        />
      </Flex>
      <OptionRow
        label="Links"
        options={CURVES}
        value={treeStore.curve}
        onChange={treeStore.setCurve}
      />
      <OptionRow
        label="Coords"
        options={COORDS}
        value={treeStore.coords}
        onChange={treeStore.setCoords}
      />
    </VStack>
  );
});
