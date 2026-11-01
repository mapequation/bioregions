import { Badge, Box, Button, HStack, IconButton, Text } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { LuChevronUp, LuMap, LuX } from 'react-icons/lu';
import { useStore } from '@/store';
import type RootStore from '@/store/RootStore';
import type { Bioregion } from '@/store/InfomapStore';
import { Tooltip } from '../ui/tooltip';
import { BioregionMinimap } from './Minimap';
import { SpeciesTables } from './SpeciesTable';
import {
  formatArea,
  formatExtent,
  formatFlow,
  formatInt,
  pluralWord,
} from './format';

const DEFAULT_ROWS = 8;
const MORE_ROWS = 25;
const PREVIEW_DELAY = 120;
// Below this share of the map in the viewport, selecting from the list leaves the camera alone
// (the map offers its own "View on map" bar instead).
const MIN_MAP_VISIBLE = 0.3;

/** Frame a just-selected bioregion, but only while enough of the map is on screen. */
export function frameIfMapVisible(store: RootStore, bioregion: Bioregion) {
  if (store.mapStore.mapVisibleRatio >= MIN_MAP_VISIBLE) {
    store.mapStore.flyToBioregion(bioregion);
  }
}

/** Toggle the selection from the list; selecting may also frame the region (never deselecting). */
export function toggleFromList(store: RootStore, bioregion: Bioregion) {
  const { selectionStore } = store;
  const wasSelected = selectionStore.selectedId === bioregion.bioregionId;
  selectionStore.toggle(bioregion.bioregionId);
  if (!wasSelected) frameIfMapVisible(store, bioregion);
}

/** Enter/Space on a role=button element (ignores keys bubbling from inner controls). */
export function onActivateKey(event: KeyboardEvent, activate: () => void) {
  if (event.target !== event.currentTarget) return;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    activate();
  }
}

/** Delayed hover preview of a bioregion on the map, cleared on leave and unmount. */
export function usePreviewHandlers(bioregionId: number) {
  const { selectionStore } = useStore();
  const timer = useRef<number | undefined>(undefined);
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      if (selectionStore.previewId === bioregionId)
        selectionStore.preview(null);
    },
    [selectionStore, bioregionId],
  );
  return {
    onPointerEnter: () => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(
        () => selectionStore.preview(bioregionId),
        PREVIEW_DELAY,
      );
    },
    onPointerLeave: () => {
      window.clearTimeout(timer.current);
      selectionStore.preview(null);
    },
  };
}

export const Swatch = ({ color }: { color: string }) => (
  <Box
    w="12px"
    h="12px"
    flexShrink={0}
    rounded="3px"
    bg={color}
    boxShadow="inset 0 0 0 1px rgba(0, 0, 0, 0.25)"
  />
);

/** Hover preview (from the list, map or tree): a 3px bar in the region color along the left
 *  edge, drawn above the header background. Content-visibility's paint containment rounds it. */
export const previewAccentCss = (color: string) => ({
  '&::before': {
    content: '""',
    position: 'absolute',
    insetBlock: 0,
    insetInlineStart: 0,
    width: '4px',
    bg: color,
    zIndex: 1,
    pointerEvents: 'none',
  },
});

// A wrapping row of facts separated by "·". Each fact after the first draws its separator
// before it; the row is pulled left by the separator width inside an overflow-hidden parent, so
// the separator of a fact that starts a line is clipped and no line starts or ends with "·".
const SEPARATOR = '1.1em';
export const dotListCss = {
  display: 'flex',
  flexWrap: 'wrap',
  marginInlineStart: `-${SEPARATOR}`,
  '& > span': { whiteSpace: 'nowrap' },
  '& > span::before': {
    content: '"·"',
    display: 'inline-block',
    width: SEPARATOR,
    textAlign: 'center',
  },
  // The sentence may wrap inside (between its phrases) on narrow cards.
  '& > span.sentence': { whiteSpace: 'normal' },
  '& > span.sentence > span': { whiteSpace: 'nowrap' },
} as const;

/** Data-quality cue for a bioregion made of a single grid cell. */
export const SingleCellBadge = () => (
  <Tooltip
    content="Single-cell bioregions often reflect one sampling locality; consider coarser cells or check record density."
    openDelay={300}
    contentProps={{ fontSize: 'xs', maxW: '16rem' }}
  >
    <Badge
      variant="outline"
      size="sm"
      color="fg.muted"
      fontWeight={400}
      flexShrink={0}
    >
      single cell
    </Badge>
  </Tooltip>
);

export const BioregionCard = observer(function BioregionCard({
  bioregion,
  highlight,
  tabIndex,
  onCollapse,
}: {
  bioregion: Bioregion;
  highlight: ReadonlySet<string> | null;
  tabIndex: number;
  // Compact mode: the header collapses the card back into a row instead of toggling the selection.
  onCollapse?: () => void;
}) {
  const store = useStore();
  const { selectionStore, colorStore, treeStore, mapStore } = store;
  const { bioregionId: id } = bioregion;
  const [numRows, setNumRows] = useState(DEFAULT_ROWS);
  // Distribution-strip tooltips are only mounted once the pointer or focus enters the card.
  const [tooltips, setTooltips] = useState(false);
  const preview = usePreviewHandlers(id);

  // Other cards are not dimmed while one is selected: the map and tree carry the dimming.
  const selected = selectionStore.selectedId === id;
  const color = colorStore.colorBioregion(id);
  const previewed = selectionStore.previewId === id;

  const facts: { key: string; content: ReactNode }[] = [
    { key: 'flow', content: `${formatFlow(bioregion.flow)} of flow` },
    { key: 'area', content: formatArea(bioregion.area) },
    { key: 'extent', content: formatExtent(bioregion.bbox) },
  ];
  if (treeStore.haveTree) {
    facts.push({
      key: 'lineage',
      content: (
        <>
          <span title="Age of the oldest phylogenetic tree node Infomap clustered into this bioregion, in the tree's time units">
            oldest lineage{' '}
            {treeStore.timeFormatter(bioregion.oldestPhyloNodeTime)}
          </span>
        </>
      ),
    });
  }

  const activate = onCollapse ?? (() => toggleFromList(store, bioregion));

  const hasMore =
    bioregion.characteristic.length > DEFAULT_ROWS ||
    bioregion.mostCommon.length > DEFAULT_ROWS;

  return (
    <Box
      data-testid="bioregion-card"
      data-bioregion-id={id}
      w="100%"
      bg="bg.panel"
      borderWidth="1px"
      borderColor={selected ? 'border.emphasized' : 'border'}
      rounded="md"
      // Selected: a 2px outline in the region color; previewed (and not selected): a left accent bar.
      outline={selected ? '2px solid' : undefined}
      outlineColor={selected ? color : undefined}
      position="relative"
      css={{
        contentVisibility: 'auto',
        containIntrinsicSize: 'auto 420px',
        ...(previewed && !selected && previewAccentCss(color)),
      }}
      onPointerEnter={() => setTooltips(true)}
      onFocus={() => setTooltips(true)}
    >
      <Box
        display="grid"
        gridTemplateColumns="auto minmax(0, 1fr) auto"
        alignItems="start"
        columnGap="3"
        p="3"
        roundedTop="md"
        cursor="pointer"
        // Selected and previewed states live on the card (outline, accent bar); the strip only
        // shows the hover affordance, and not on the selected card.
        _hover={{ bg: selected ? undefined : 'bg.subtle' }}
        // The whole header strip selects (or collapses, in compact mode); the buttons and the
        // minimap handle their own clicks. Only the strip previews, so reading the tables doesn't.
        onClick={activate}
        {...preview}
      >
        <BioregionMinimap bioregion={bioregion} height={112} />
        <Box
          data-testid="bioregion-card-header"
          data-roving=""
          role="button"
          tabIndex={tabIndex}
          aria-pressed={onCollapse ? undefined : selected}
          aria-expanded={onCollapse ? true : undefined}
          cursor="pointer"
          minH="112px"
          rounded="sm"
          outline="none"
          _focusVisible={{
            outline: '2px solid',
            outlineColor: 'colorPalette.focusRing',
            outlineOffset: '2px',
          }}
          onKeyDown={(e) => onActivateKey(e, activate)}
        >
          <HStack gap="2" h="8">
            <Swatch color={color} />
            <Tooltip
              content={`${formatFlow(bioregion.flow)} of network flow · ${formatInt(bioregion.members.length)} species clustered by Infomap`}
              openDelay={400}
              contentProps={{ fontSize: 'xs' }}
            >
              <Text as="h3" fontSize="16px" fontWeight={600} lineHeight="1.2">
                Bioregion {id}
              </Text>
            </Tooltip>
            {bioregion.numGridCells === 1 && <SingleCellBadge />}
          </HStack>
          {/* Each phrase is an unbreakable unit and lines wrap only between them; a fact's "·"
              comes before it and is clipped at line starts (dotListCss), so no line starts or
              ends with one. */}
          <Box overflow="hidden">
            <Text
              as="div"
              fontSize="14px"
              color="fg"
              fontVariantNumeric="tabular-nums"
              css={{ ...dotListCss, '& b': { fontWeight: 600 } }}
            >
              <span className="sentence">
                <span>
                  <b>{formatInt(bioregion.numRecords)}</b>{' '}
                  {pluralWord(bioregion.numRecords, 'record')}
                </span>{' '}
                <span>
                  of <b>{formatInt(bioregion.numSpecies)}</b> species
                </span>{' '}
                <span>
                  in <b>{formatInt(bioregion.numGridCells)}</b>{' '}
                  {pluralWord(bioregion.numGridCells, 'cell')}
                </span>
              </span>
              {bioregion.numFoundOnlyHere > 0 && (
                <span>
                  <b>{formatInt(bioregion.numFoundOnlyHere)}</b> found only here
                </span>
              )}
            </Text>
          </Box>
          <Box overflow="hidden" mt="0.5">
            <Text
              as="div"
              fontSize="13px"
              color="fg.muted"
              fontVariantNumeric="tabular-nums"
              css={dotListCss}
            >
              {facts.map(({ key, content }) => (
                <span key={key}>{content}</span>
              ))}
            </Text>
          </Box>
        </Box>
        <HStack gap="1" h="8">
          {selected && (
            <Button
              variant="subtle"
              size="xs"
              aria-label={`Clear selection of bioregion ${id}`}
              title="Clear selection"
              onClick={(e) => {
                e.stopPropagation();
                selectionStore.select(null);
              }}
            >
              Selected <LuX />
            </Button>
          )}
          <Button
            variant="ghost"
            size="xs"
            onClick={(e) => {
              e.stopPropagation();
              mapStore.showOnMap(bioregion);
            }}
          >
            <LuMap /> Show on map
          </Button>
          {onCollapse && (
            <IconButton
              aria-label={`Collapse bioregion ${id}`}
              aria-expanded
              variant="ghost"
              size="xs"
              onClick={(e) => {
                e.stopPropagation();
                onCollapse();
              }}
            >
              <LuChevronUp />
            </IconButton>
          )}
        </HStack>
      </Box>

      <Box px="3" pb="3">
        <SpeciesTables
          bioregion={bioregion}
          numRows={numRows}
          highlight={highlight}
          tooltips={tooltips}
        />
        {hasMore && (
          <Button
            variant="plain"
            size="xs"
            w="100%"
            color="fg.muted"
            mt="1"
            _hover={{ color: 'fg', textDecoration: 'underline' }}
            onClick={() =>
              setNumRows((n) => (n === DEFAULT_ROWS ? MORE_ROWS : DEFAULT_ROWS))
            }
          >
            {numRows === DEFAULT_ROWS
              ? `Show top ${MORE_ROWS}`
              : `Show top ${DEFAULT_ROWS}`}
          </Button>
        )}
      </Box>
    </Box>
  );
});
