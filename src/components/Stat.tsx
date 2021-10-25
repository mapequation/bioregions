import { Flex, Spacer, Tag, TagProps } from '@chakra-ui/react';

type StatProps = {
  label: string;
} & TagProps;

export default function Stat({ label, children, ...props }: StatProps) {
  return (<Flex fontSize="sm" w="100%">
    {label}<Spacer /><Tag size="sm" {...props}>{children}</Tag>
  </Flex>);
}