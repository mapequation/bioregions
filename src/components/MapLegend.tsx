import { observer } from 'mobx-react';
import { Box, chakra } from '@chakra-ui/react';
import { useStore } from '../store';
import type { Bioregion } from '../store/InfomapStore';
import { formatFlow, plural } from './Statistics/format';
import { Tooltip } from './ui/tooltip';

/** Chips beyond this collapse into a "+N" chip that leads to the full list. */
const MAX_CHIPS = 16;

const prefersReducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const ChipButton = chakra('button', {
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '1',
    h: '24px',
    px: '1.5',
    borderRadius: 'sm',
    fontSize: 'xs',
    fontWeight: '600',
    color: 'fg',
    cursor: 'pointer',
    transition: 'opacity 120ms ease-out, background 120ms ease-out',
    _hover: { bg: 'bg.muted' },
    _focusVisible: {
      outline: '2px solid',
      outlineColor: 'colorPalette.focusRing',
    },
    _motionReduce: { transition: 'none' },
  },
});

// Tooltips match the map's hover card (panel surface, border, shadow) instead of Chakra's
// inverted default, so they read the same in light and dark mode.
const tooltipContentProps = {
  bg: 'bg.panel',
  color: 'fg',
  borderWidth: '1px',
  borderColor: 'border',
  boxShadow: 'md',
  fontSize: '12px',
  fontWeight: 'normal',
  lineHeight: '1.45',
  maxW: '340px',
  css: {
    '--tooltip-bg': 'colors.bg.panel',
    fontVariantNumeric: 'tabular-nums',
    '& [data-part=arrow-tip]': { borderColor: 'border' },
  },
} as const;

const stats = (b: Bioregion) => [
  plural(b.numRecords, 'record'),
  plural(b.numSpecies, 'species', 'species'),
  plural(b.numGridCells, 'cell') +
    (b.numGridCells === 1 ? ' · possibly one sampling locality' : ''),
];

const describe = (b: Bioregion) =>
  [
    `Bioregion ${b.bioregionId}`,
    `${formatFlow(b.flow)} of flow`,
    ...stats(b),
  ].join(' · ');

/** Two-line chip tooltip: swatch, name and flow share, then the counts. Each "·" segment stays
 *  on one line. */
const ChipTooltip = ({
  bioregion,
  color,
}: {
  bioregion: Bioregion;
  color?: string;
}) => (
  <>
    <Box display="flex" alignItems="center" gap="1.5">
      <Box
        w="10px"
        h="10px"
        borderRadius="2px"
        flexShrink={0}
        bg={color}
        boxShadow="inset 0 0 0 1px rgba(0,0,0,0.15)"
      />
      <chakra.span fontWeight="600">
        Bioregion {bioregion.bioregionId}
      </chakra.span>
      <chakra.span color="fg.muted" whiteSpace="nowrap">
        {formatFlow(bioregion.flow)} of flow
      </chakra.span>
    </Box>
    {/* Counts on one line, cells (and the single-cell caveat) on the next: no line ends in "·". */}
    <Box color="fg.muted" whiteSpace="nowrap">
      {stats(bioregion).slice(0, 2).join(' · ')}
    </Box>
    <Box color="fg.muted" whiteSpace="nowrap">
      {stats(bioregion)[2]}
    </Box>
  </>
);

const Chip = observer(function _Chip({ bioregion }: { bioregion: Bioregion }) {
  const { selectionStore, mapStore, colorStore } = useStore();
  const id = bioregion.bioregionId;
  const selected = selectionStore.selectedId === id;
  const label = describe(bioregion);

  const onClick = () => {
    selectionStore.toggle(id);
    if (selectionStore.selectedId === id) mapStore.flyToBioregion(bioregion);
  };

  return (
    <Tooltip
      content={
        <ChipTooltip
          bioregion={bioregion}
          color={colorStore.colorBioregion(id)}
        />
      }
      contentProps={tooltipContentProps}
      showArrow
      positioning={{ placement: 'top' }}
      openDelay={120}
      closeDelay={50}
    >
      <ChipButton
        type="button"
        aria-label={label}
        aria-pressed={selected}
        onClick={onClick}
        onMouseEnter={() => selectionStore.preview(id)}
        onMouseLeave={() => selectionStore.preview(null)}
        onFocus={() => selectionStore.preview(id)}
        onBlur={() => selectionStore.preview(null)}
        opacity={selectionStore.isDimmed(id) ? 0.55 : 1}
        boxShadow={
          selected ? `0 0 0 2px ${colorStore.colorBioregion(id)}` : undefined
        }
      >
        <Box
          w="10px"
          h="10px"
          borderRadius="2px"
          flexShrink={0}
          bg={colorStore.colorBioregion(id)}
          boxShadow="inset 0 0 0 1px rgba(0,0,0,0.15)"
        />
        {id}
      </ChipButton>
    </Tooltip>
  );
});

/** Clickable legend over the map's bottom-left corner in bioregion mode: one chip per bioregion
 *  (swatch + number). Hover previews the region on the map, click toggles the selection and
 *  frames it. Only the legend itself takes pointer events, the rest of the map stays live. */
/** Key for grid squares without records: no cell is drawn there, so the land shows through. */
const NoRecordsKey = observer(function _NoRecordsKey() {
  const { mapStore } = useStore();
  return (
    <Tooltip
      content="Grid squares without occurrence records: the land shows through"
      contentProps={tooltipContentProps}
      showArrow
      positioning={{ placement: 'top' }}
      openDelay={120}
      closeDelay={50}
    >
      <Box
        as="span"
        tabIndex={0}
        display="inline-flex"
        alignItems="center"
        gap="1"
        h="24px"
        px="1.5"
        fontSize="xs"
        color="fg.muted"
        borderLeftWidth="1px"
        borderColor="border"
        ms="1"
      >
        <Box
          w="10px"
          h="10px"
          borderRadius="2px"
          flexShrink={0}
          bg={mapStore.landColor}
          borderWidth="1px"
          borderColor="border.emphasized"
        />
        No records
      </Box>
    </Tooltip>
  );
});

export default observer(function MapLegend() {
  const { mapStore, infomapStore } = useStore();
  const { bioregions } = infomapStore;
  if (mapStore.renderType !== 'bioregions' || bioregions.length === 0) {
    return null;
  }
  const shown = bioregions.slice(0, MAX_CHIPS);
  const rest = bioregions.length - shown.length;

  return (
    <Box
      data-testid="map-legend"
      role="group"
      aria-label="Bioregion legend"
      position="absolute"
      left="8px"
      bottom="8px"
      maxW="calc(100% - 16px)"
      display="flex"
      flexWrap="wrap"
      gap="2px"
      p="2px"
      bg="bg.panel/90"
      backdropFilter="blur(6px)"
      borderWidth="1px"
      borderColor="border"
      borderRadius="md"
      boxShadow="sm"
      zIndex={5}
      css={{ fontVariantNumeric: 'tabular-nums' }}
    >
      {shown.map((b) => (
        <Chip key={b.bioregionId} bioregion={b} />
      ))}
      {rest > 0 && (
        <Tooltip
          content="Show all bioregions in the list"
          contentProps={tooltipContentProps}
          showArrow
          positioning={{ placement: 'top' }}
          openDelay={120}
          closeDelay={50}
        >
          <ChipButton
            type="button"
            aria-label={`${rest} more bioregions: show the list`}
            color="fg.muted"
            onClick={() =>
              document.getElementById('bioregions')?.scrollIntoView({
                behavior: prefersReducedMotion() ? 'auto' : 'smooth',
                block: 'start',
              })
            }
          >
            +{rest}
          </ChipButton>
        </Tooltip>
      )}
      <NoRecordsKey />
    </Box>
  );
});
