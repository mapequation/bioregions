import { HStack, Icon, Text } from '@chakra-ui/react';
import { LuDatabase, LuEye, LuTriangleAlert } from 'react-icons/lu';
import type ExplorerStore from '../../../store/ExplorerStore';
import { fmtInt } from '../format';

/** What the insights describe: the preview of the query, the loaded dataset, or a partial load. */
export interface InsightsScope {
  kind: 'preview' | 'loaded' | 'partial' | (string & {});
  records: number;
  label: string;
}

/** `explorerStore.insightsScope`, guarded while the store contract is rolled out. */
export function insightsScope(ex: ExplorerStore): InsightsScope | null {
  return (ex as unknown as { insightsScope?: InsightsScope | null }).insightsScope ?? null;
}

const ICON = { preview: LuEye, loaded: LuDatabase, partial: LuTriangleAlert } as const;

/** One muted line under a section heading naming what the numbers below are computed on. */
export function ScopeLine({
  scope,
  id,
  partialNote = true,
}: {
  scope: InsightsScope | null;
  id?: string;
  /** Add that the checks use the full query when the load is partial (bias checks only). */
  partialNote?: boolean;
}) {
  if (!scope) return null;
  const count = fmtInt(scope.records);
  const label = scope.label.includes(count) ? scope.label : `${scope.label} · ${count} records`;
  const partial = scope.kind === 'partial';
  return (
    <HStack id={id} gap={1.5} align="start" mt={-1} mb={2} textStyle="xs" color="fg.muted" fontVariantNumeric="tabular-nums">
      <Icon
        as={ICON[scope.kind as keyof typeof ICON] ?? LuEye}
        boxSize={3}
        mt="3px"
        flexShrink={0}
        color={partial ? 'orange.fg' : 'fg.muted'}
        aria-hidden
      />
      <Text lineHeight="short" minW={0}>
        {label}
        {partial && partialNote && <>. Checks are computed on the full query, not the partial dataset.</>}
      </Text>
    </HStack>
  );
}
