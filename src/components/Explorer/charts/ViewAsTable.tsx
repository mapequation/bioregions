import { Box, Button, Flex } from '@chakra-ui/react';
import { type ReactNode, useState } from 'react';
import { LuChartBar, LuTable } from 'react-icons/lu';

export interface ViewAsTableProps {
  /** What the chart shows, for the toggle's accessible name. */
  label: string;
  table: ReactNode;
  children: ReactNode;
  /** Optional heading drawn left of the toggle, in the same row. */
  title?: ReactNode;
  /** Extra controls drawn right of the toggle (e.g. a CSV button). */
  actions?: ReactNode;
  /** Controlled mode: whether the table is shown. */
  asTable?: boolean;
  onAsTableChange?: (asTable: boolean) => void;
}

/** Shows a chart with a small toggle that swaps it for an equivalent table. */
export default function ViewAsTable({
  label,
  table,
  children,
  title,
  actions,
  asTable: asTableProp,
  onAsTableChange,
}: ViewAsTableProps) {
  const [own, setOwn] = useState(false);
  const asTable = asTableProp ?? own;
  const toggle = () => {
    setOwn(!asTable);
    onAsTableChange?.(!asTable);
  };
  return (
    <Box>
      <Flex align="center" gap={1} minH={7} mb={1}>
        <Box flex="1" minW={0}>
          {title}
        </Box>
        <Button
          size="xs"
          variant="ghost"
          aria-pressed={asTable}
          aria-label={`${asTable ? 'View as chart' : 'View as table'}: ${label}`}
          onClick={toggle}
        >
          {asTable ? <LuChartBar /> : <LuTable />}
          {asTable ? 'View as chart' : 'View as table'}
        </Button>
        {actions}
      </Flex>
      {asTable ? table : children}
    </Box>
  );
}
