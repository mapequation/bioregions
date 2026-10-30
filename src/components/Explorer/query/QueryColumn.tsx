import { Box, Flex, Heading, HStack, Icon, Stack, Text, VisuallyHidden } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import type { ReactNode } from 'react';
import { LuLock } from 'react-icons/lu';
import { areaLabel, depthLabel, taxaLabel, yearsLabel } from '@/sources';
import { useStore } from '../../../store';
import type { QuerySection } from '../../../store/explorer/types';
import { Tooltip } from '../../ui/tooltip';
import AreaPicker from './AreaPicker';
import DepthField from './DepthField';
import QualityPanel from './QualityPanel';
import TaxonPicker from './TaxonPicker';
import YearBrush from './YearBrush';

interface SectionProps {
  id: QuerySection;
  title: string;
  summary: string;
  children: ReactNode;
}

/** One query section: uppercase title, one-line summary and a dot when changed since the last load. */
export const QuerySectionBox = observer(function QuerySectionBox({ id, title, summary, children }: SectionProps) {
  const { explorerStore } = useStore();
  const dirty = explorerStore.dirty.has(id);
  const headingId = `explorer-q-${id}`;
  return (
    <Box as="section" aria-labelledby={headingId} px={4} pt={3} pb={4} borderBottomWidth="1px" borderColor="border.muted">
      <Flex align="center" gap={2} mb={2.5} minH={5}>
        <Heading
          as="h3"
          id={headingId}
          fontSize="xs"
          fontWeight="semibold"
          letterSpacing="wider"
          textTransform="uppercase"
          color="fg.muted"
          flexShrink={0}
        >
          {title}
        </Heading>
        {dirty && (
          <Tooltip content="Changed since the last load" openDelay={200}>
            <Box as="span" display="inline-flex" boxSize={2} borderRadius="full" bg="blue.solid" flexShrink={0} tabIndex={-1}>
              <VisuallyHidden>changed since the last load</VisuallyHidden>
            </Box>
          </Tooltip>
        )}
        <Text ml="auto" fontSize="xs" color="fg.muted" truncate title={summary} minW={0} textAlign="right">
          {summary}
        </Text>
      </Flex>
      {children}
    </Box>
  );
});

/** Left column of the Occurrences tab: taxa, area, years, depth and quality. */
export default observer(function QueryColumn() {
  const { explorerStore } = useStore();
  const q = explorerStore.query;
  const job = explorerStore.job;
  const locked = job?.state === 'planning' || job?.state === 'streaming';
  const presetLabel = { recommended: 'Recommended', permissive: 'Permissive', custom: 'Custom' }[explorerStore.preset];

  return (
    <Stack gap={0} position="relative">
      {/*
        Lock strip: a zero-height sticky anchor with the strip absolutely positioned on it,
        so it overlays the (dimmed, inert) top of the column instead of pushing it down.
        The status region is always mounted so the change is announced.
      */}
      <Box position="sticky" top={0} h={0} zIndex={2} role="status" aria-live="polite">
        {locked && (
          <HStack
            position="absolute"
            top={0}
            insetX={0}
            h={8}
            gap={2}
            px={4}
            fontSize="xs"
            fontWeight="medium"
            bg="bg.muted"
            color="fg"
            borderBottomWidth="1px"
            borderColor="border"
            boxShadow="xs"
          >
            <Icon as={LuLock} boxSize={3.5} color="fg.muted" aria-hidden />
            <Text truncate>Locked while loading</Text>
            <Text ml="auto" color="fg.muted" fontWeight="normal" whiteSpace="nowrap">
              Cancel to edit
            </Text>
          </HStack>
        )}
      </Box>
      <Box opacity={locked ? 0.5 : 1} inert={locked} aria-disabled={locked || undefined} transition="opacity 0.15s">
        <QuerySectionBox id="taxa" title="Taxa" summary={q.taxa.length ? taxaLabel(q.taxa, 2) : 'All taxa'}>
          <TaxonPicker />
        </QuerySectionBox>
        <QuerySectionBox id="area" title="Area" summary={areaLabel(q.area)}>
          <AreaPicker />
        </QuerySectionBox>
        <QuerySectionBox id="years" title="Years" summary={yearsLabel(q.years)}>
          <YearBrush />
        </QuerySectionBox>
        <QuerySectionBox id="depth" title="Depth · OBIS" summary={q.sources.obis ? (depthLabel(q.depth) ?? 'Any depth') : 'OBIS off'}>
          <DepthField />
        </QuerySectionBox>
        <QuerySectionBox id="quality" title="Quality" summary={presetLabel}>
          <QualityPanel />
        </QuerySectionBox>
      </Box>
    </Stack>
  );
});
