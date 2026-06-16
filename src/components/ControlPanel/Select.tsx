import { createListCollection, type SelectRootProps } from '@chakra-ui/react';
import {
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectRoot,
  SelectTrigger,
  SelectValueText,
} from '../ui/select';

type SelectOption = {
  label: string;
  value: string;
};

interface SelectProps extends Omit<SelectRootProps, 'collection'> {
  items: SelectOption[];
  label?: string;
  placeholder?: string;
}

const Select = (props: SelectProps) => {
  const { items, label, placeholder, ...rest } = props;
  const collection = createListCollection({
    items,
  });
  return (
    <SelectRoot {...rest} collection={collection} style={{ zIndex: 4000 }}>
      {label && <SelectLabel>{label}</SelectLabel>}
      <SelectTrigger>
        <SelectValueText placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {collection.items.map((item) => (
          <SelectItem item={item} key={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </SelectRoot>
  );
};

export default Select;
