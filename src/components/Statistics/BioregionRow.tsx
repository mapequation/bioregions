import { Box, HStack, Text } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { LuChevronDown } from 'react-icons/lu';
import { useStore } from '@/store';
import type { Bioregion } from '@/store/InfomapStore';
import {
  onActivateKey,
  previewAccentCss,
  SingleCellBadge,
  usePreviewHandlers,
} from './BioregionCard';
import { BioregionMinimap } from './Minimap';
import { formatFlow, formatInt, plural } from './format';

/** A 48px summary row of a bioregion, used in the compact list; click expands it into a card. */
export const BioregionRow = observer(function BioregionRow({
  bioregion,
  maxFlow,
  tabIndex,
  onExpand,
}: {
  bioregion: Bioregion;
  maxFlow: number;
  tabIndex: number;
  onExpand: () => void;
}) {
  const { selectionStore, colorStore } = useStore();
  const { bioregionId: id } = bioregion;
  const preview = usePreviewHandlers(id);
  const selected = selectionStore.selectedId === id;
  const previewed = selectionStore.previewId === id;
  const color = colorStore.colorBioregion(id);
  const flow = formatFlow(bioregion.flow);
  const flowRatio = maxFlow > 0 ? bioregion.flow / maxFlow : 0;

  const stats = [
    `${formatInt(bioregion.numRecords)} rec`,
    `${formatInt(bioregion.numSpecies)} spp`,
    plural(bioregion.numGridCells, 'cell'),
  ];
  if (bioregion.numFoundOnlyHere > 0) {
    stats.push(`${formatInt(bioregion.numFoundOnlyHere)} only here`);
  }

  return (
    <Box
      data-testid="bioregion-row"
      data-bioregion-id={id}
      data-roving=""
      role="button"
      tabIndex={tabIndex}
      aria-expanded={false}
      aria-pressed={selected}
      aria-label={`Bioregion ${id}: ${stats.join(', ')}, ${flow} of network flow`}
      display="grid"
      gridTemplateColumns="auto minmax(7rem, auto) minmax(0, 1fr) auto 48px 16px"
      alignItems="center"
      columnGap="3"
      h="48px"
      px="3"
      w="100%"
      bg={selected ? 'bg.subtle' : 'bg.panel'}
      borderWidth="1px"
      borderColor={selected ? 'border.emphasized' : 'border'}
      rounded="md"
      cursor="pointer"
      outline={selected ? '2px solid' : 'none'}
      outlineColor={selected ? color : undefined}
      _hover={{ borderColor: 'border.emphasized' }}
      _focusVisible={{
        outline: '2px solid',
        outlineColor: 'colorPalette.focusRing',
        outlineOffset: '2px',
      }}
      fontVariantNumeric="tabular-nums"
      position="relative"
      css={{
        contentVisibility: 'auto',
        containIntrinsicSize: 'auto 48px',
        ...(previewed && !selected && previewAccentCss(color)),
      }}
      onClick={onExpand}
      onKeyDown={(e) => onActivateKey(e, onExpand)}
      {...preview}
    >
      {/* The minimap's border in the region color doubles as the row's color key. */}
      <Box
        borderWidth="1.5px"
        borderColor={color}
        rounded="3px"
        overflow="hidden"
        lineHeight={0}
        aria-hidden
      >
        <BioregionMinimap
          bioregion={bioregion}
          height={36}
          interactive={false}
        />
      </Box>
      <HStack gap="2" minW={0}>
        <Text fontSize="sm" fontWeight={600} truncate>
          Bioregion {id}
        </Text>
        {bioregion.numGridCells === 1 && <SingleCellBadge />}
      </HStack>
      <Text fontSize="13px" color="fg.muted" truncate>
        {stats.join(' · ')}
      </Text>
      <Text
        fontSize="13px"
        color="fg.muted"
        textAlign="right"
        whiteSpace="nowrap"
        title={`${flow} of network flow`}
      >
        {flow} of flow
      </Text>
      {/* Flow relative to the largest bioregion; never thinner than 2px so it stays visible. */}
      <Box h="4px" bg="bg.muted" rounded="full" aria-hidden>
        <Box
          h="100%"
          w={`max(2px, ${100 * flowRatio}%)`}
          bg={color}
          rounded="full"
        />
      </Box>
      <Box color="fg.muted">
        <LuChevronDown />
      </Box>
    </Box>
  );
});
