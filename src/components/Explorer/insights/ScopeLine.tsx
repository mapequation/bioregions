import { Box, HStack, Icon, Text } from '@chakra-ui/react';
import { LuDatabase, LuEye, LuTriangleAlert } from 'react-icons/lu';
import type ExplorerStore from '../../../store/ExplorerStore';
import { Tooltip } from '../../ui/tooltip';
import { fmtInt } from '../format';

/** What the insights describe: the preview of the query, the loaded dataset, or a partial load. */
export interface InsightsScope {
  kind: 'query' | 'preview' | 'loaded' | 'partial' | (string & {});
  records: number;
  label: string;
}

/** `explorerStore.insightsScope`, guarded while the store contract is rolled out. */
export function insightsScope(ex: ExplorerStore): InsightsScope | null {
  return (ex as unknown as { insightsScope?: InsightsScope | null }).insightsScope ?? null;
}

/**
 * Placement for every tooltip and popover in the insights column: it sits at the right
 * edge of the window, so open to the left (flipping when there is no room) and keep 8 px
 * clear of the viewport.
 */
export const INSIGHTS_POSITIONING = { placement: 'left', flip: true, shift: 8, gutter: 8 } as const;
/** Tooltip content that wraps instead of running past the viewport. */
export const INSIGHTS_TIP_PROPS = { maxW: '260px', whiteSpace: 'normal', textWrap: 'pretty', lineHeight: 'short' } as const;

const ICON = { query: LuEye, preview: LuEye, loaded: LuDatabase, partial: LuTriangleAlert } as const;

/** One-line scope ("Query · 16,772 records") plus the long explanation for the tooltip. */
export function scopeText(kind: InsightsScope['kind'], records: number, detail?: string): { short: string; long: string } {
  const n = fmtInt(records);
  if (kind === 'partial') {
    return {
      short: `Partial · ${n} records`,
      long: `${detail ? `${detail}. ` : 'The load was stopped early. '}These numbers describe the ${n} records loaded so far, not the full query.`,
    };
  }
  if (kind === 'loaded') {
    return {
      short: `Loaded · ${n} records`,
      long: `Computed on the ${n} records of the loaded dataset, after cleaning and de-duplication. Change the query to preview it again.`,
    };
  }
  return {
    short: `Query · ${n} records`,
    long: `Computed on the preview of the query: the ${n} records the sources report as matching. Load the data to see the cleaned dataset.`,
  };
}

/** One muted line under a section heading naming what the numbers below are computed on. */
export function ScopeLine({
  kind,
  records,
  id,
  detail,
}: {
  kind: InsightsScope['kind'] | null | undefined;
  records: number;
  id?: string;
  /** Store label with the partial-load details, for the tooltip. */
  detail?: string;
}) {
  if (!kind) return null;
  const { short, long } = scopeText(kind, records, detail);
  const partial = kind === 'partial';
  return (
    <Tooltip
      content={long}
      openDelay={300}
      positioning={INSIGHTS_POSITIONING}
      contentProps={INSIGHTS_TIP_PROPS}
    >
      <HStack
        id={id}
        tabIndex={0}
        gap={1.5}
        mt={-1}
        mb={2}
        maxW="full"
        w="fit-content"
        textStyle="xs"
        color="fg.muted"
        fontVariantNumeric="tabular-nums"
        rounded="sm"
        cursor="help"
        outline="none"
        _focusVisible={{ outline: '2px solid', outlineColor: 'colorPalette.focusRing', outlineOffset: '1px' }}
      >
        <Icon
          as={ICON[kind as keyof typeof ICON] ?? LuEye}
          boxSize={3}
          flexShrink={0}
          color={partial ? 'orange.fg' : 'fg.muted'}
          aria-hidden
        />
        <Text lineHeight="short" minW={0} truncate>
          {short}
        </Text>
        <Box as="span" srOnly>
          . {long}
        </Box>
      </HStack>
    </Tooltip>
  );
}
