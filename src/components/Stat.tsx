import {
  Flex,
  FormControl,
  FormLabel,
  Heading,
  Spacer,
  Tag,
  TagProps,
  Text,
} from '@chakra-ui/react';

type StatProps = {
  label: string;
  disabled?: boolean;
} & TagProps;

export default function Stat({
  label,
  disabled,
  children,
  ...props
}: StatProps) {
  return (
    <FormControl w="100%" isDisabled={disabled} as={Flex} alignItems="center">
      <FormLabel fontSize="sm">{label}</FormLabel>
      <Spacer />
      <Tag size="sm" {...props}>
        {children}
      </Tag>
    </FormControl>
  );
}
