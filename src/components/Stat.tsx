import { Field, Flex, Spacer, Tag, type TagRootProps } from '@chakra-ui/react';

type StatProps = {
  label: string;
  disabled?: boolean;
} & TagRootProps;

export default function Stat({
  label,
  disabled,
  children,
  ...props
}: StatProps) {
  return (
    <Field.Root
      w="100%"
      disabled={disabled}
      as={Flex}
      flexDir="row"
      alignItems="center"
    >
      <Field.Label fontSize="sm">{label}</Field.Label>
      <Spacer />
      <Tag.Root size="md" {...props}>
        <Tag.Label>{children}</Tag.Label>
      </Tag.Root>
    </Field.Root>
  );
}
