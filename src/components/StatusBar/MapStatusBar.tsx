import type { ReactNode } from 'react';
import { observer } from 'mobx-react';
import { Box, chakra } from '@chakra-ui/react';
import { LuArrowDown, LuFocus, LuX } from 'react-icons/lu';
import { useStore } from '../../store';
import { formatThousands } from '../../utils/formats';
import { Tooltip } from '../ui/tooltip';
import { BACKENDS, PROJECTIONS, PROJECTIONNAME } from '../../store/MapStore';
import { StatusBar, StatusGroup, StatusButton, StatusDivider } from './StatusBar';
import StatusBarSettings from './StatusBarSettings';
import {
  bioregionIconColors,
  ProjectionIcon,
  RecordsIcon,
  HeatmapIcon,
  BioregionsIcon,
  BoundariesFuzzyIcon,
  ClipOnIcon,
  ResetViewIcon,
  FitDataIcon,
} from './icons';

const prefersReducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Scroll the bioregion's card in the list into view and move focus to its header. */
function scrollToCard(bioregionId: number) {
  const card = document.querySelector<HTMLElement>(
    `[data-testid="bioregion-card"][data-bioregion-id="${bioregionId}"]`,
  );
  // Compact density renders collapsed rows (themselves focusable buttons) instead of cards.
  const row = card
    ? null
    : document.querySelector<HTMLElement>(
        `[data-testid="bioregion-row"][data-bioregion-id="${bioregionId}"]`,
      );
  const target = card ?? row ?? document.getElementById('bioregions');
  if (!target) return;
  target.scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    block: card ? 'start' : 'center',
  });
  const focusTarget =
    card?.querySelector<HTMLElement>('[data-testid="bioregion-card-header"]') ??
    row;
  focusTarget?.focus({ preventScroll: true });
}

/** A small button inside the selection chip: icon plus an optional visible `text` (hidden
 *  with the chip's other text at narrow bar widths, when the tooltip carries the label). */
function ChipButton({
  label,
  text,
  onClick,
  children,
}: {
  label: string;
  text?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip content={label} showArrow openDelay={250} closeDelay={50}>
      <chakra.button
        type="button"
        aria-label={label}
        onClick={onClick}
        minW="24px"
        h="24px"
        px={text ? 1.5 : 0}
        display="flex"
        alignItems="center"
        justifyContent="center"
        gap={1}
        flex="0 0 auto"
        borderRadius="sm"
        fontSize="12px"
        fontWeight="500"
        color="fg.muted"
        cursor="pointer"
        _hover={{ bg: 'bg.muted', color: 'fg' }}
        _focusVisible={{ outline: '2px solid', outlineColor: 'blue.focusRing' }}
        css={text ? { '@container (max-width: 860px)': { px: 0 } } : undefined}
      >
        {children}
        {text && (
          <Box
            as="span"
            aria-hidden
            css={{ '@container (max-width: 860px)': { display: 'none' } }}
          >
            {text}
          </Box>
        )}
      </chakra.button>
    </Tooltip>
  );
}

/** The selected bioregion, its key numbers and quick actions, at the right end of the bar.
 *  Container queries on the bar's width drop the numbers, then the word "Bioregion" (the
 *  swatch keeps its number), so the chip never wraps the bar onto a second row by itself. */
const SelectionChip = observer(function _SelectionChip() {
  const { selectionStore, infomapStore, colorStore, mapStore } = useStore();
  const id = selectionStore.selectedId;
  const bioregion =
    id === null
      ? undefined
      : infomapStore.bioregions.find((b) => b.bioregionId === id);
  if (id === null || !bioregion) return null;
  return (
    <Box
      data-testid="selection-chip"
      role="group"
      aria-label={`Selected bioregion ${id}`}
      display="flex"
      alignItems="center"
      gap={1.5}
      h="34px"
      pl={2}
      pr={0.5}
      minW={0}
      borderWidth="1px"
      borderColor="border"
      borderRadius="5px"
      bg="bg.subtle"
      whiteSpace="nowrap"
      fontSize="12px"
    >
      <Box
        w="12px"
        h="12px"
        borderRadius="2px"
        flexShrink={0}
        bg={colorStore.colorBioregion(id)}
        boxShadow="inset 0 0 0 1px rgba(0,0,0,0.15)"
      />
      <Box
        fontWeight="600"
        color="fg"
        css={{ fontVariantNumeric: 'tabular-nums' }}
      >
        <Box
          as="span"
          css={{ '@container (max-width: 860px)': { display: 'none' } }}
        >
          Bioregion{' '}
        </Box>
        {id}
      </Box>
      <Box
        color="fg.muted"
        css={{
          fontVariantNumeric: 'tabular-nums',
          '@container (max-width: 1000px)': { display: 'none' },
        }}
      >
        {formatThousands(bioregion.numRecords)} rec ·{' '}
        {formatThousands(bioregion.numSpecies)} spp ·{' '}
        {formatThousands(bioregion.numGridCells)} cells
      </Box>
      <Box display="flex" alignItems="center" gap={0.5}>
        <ChipButton
          label={`Zoom to bioregion ${id}`}
          text="Zoom"
          onClick={() => mapStore.flyToBioregion(bioregion)}
        >
          <LuFocus size={14} />
        </ChipButton>
        <ChipButton
          label={`Details for bioregion ${id}`}
          text="Details"
          onClick={() => scrollToCard(id)}
        >
          <LuArrowDown size={14} />
        </ChipButton>
        <ChipButton
          label="Clear selection (Esc)"
          onClick={() => selectionStore.select(null)}
        >
          <LuX size={14} />
        </ChipButton>
      </Box>
    </Box>
  );
});

const BACKEND_LABEL: Record<string, string> = {
  auto: 'GL',
  canvas: '2D',
  svg: 'SVG',
};
const BACKEND_HELP: Record<string, string> = {
  auto: 'WebGL — GPU rendering, smooth globe & large data',
  canvas: 'Canvas 2D — paints the first frame sooner',
  svg: 'SVG — vector output, exportable',
};

export default observer(function MapStatusBar() {
  const { mapStore, infomapStore, colorStore, settingsStore } = useStore();
  const [r1, r2] = bioregionIconColors(colorStore);
  const isBioregions = mapStore.renderType === 'bioregions';
  const levelCount = infomapStore.numLevels - 1; // selectable levels (slider was 0..numLevels-2)

  return (
    <StatusBar showLabels={settingsStore.showStatusBarLabels}>
      <StatusGroup caption="backend">
        {BACKENDS.map((b) => (
          <StatusButton
            key={b}
            active={mapStore.backend === b}
            content={BACKEND_HELP[b]}
            onClick={() => mapStore.setBackend(b)}
          >
            {BACKEND_LABEL[b]}
          </StatusButton>
        ))}
      </StatusGroup>

      <StatusDivider />

      <StatusGroup caption="projection">
        {PROJECTIONS.map((p) => (
          <StatusButton
            key={p}
            active={mapStore.projectionName === p}
            content={PROJECTIONNAME[p]}
            onClick={() => mapStore.setProjection(p)}
          >
            <ProjectionIcon name={p} />
          </StatusButton>
        ))}
      </StatusGroup>

      <StatusGroup caption="show">
        <StatusButton
          active={mapStore.renderType === 'records'}
          content="Records — raw occurrence points"
          onClick={() => mapStore.setRenderType('records')}
        >
          <RecordsIcon />
        </StatusButton>
        <StatusButton
          active={mapStore.renderType === 'heatmap'}
          content="Heatmap — value per grid cell"
          onClick={() => mapStore.setRenderType('heatmap')}
        >
          <HeatmapIcon />
        </StatusButton>
        <StatusButton
          active={isBioregions}
          disabled={!infomapStore.haveBioregions}
          content={
            infomapStore.haveBioregions
              ? 'Bioregions — computed regions'
              : 'Bioregions — run Infomap first'
          }
          onClick={() => mapStore.setRenderType('bioregions')}
        >
          <BioregionsIcon r1={r1} r2={r2} />
        </StatusButton>
      </StatusGroup>

      {infomapStore.numLevels > 2 && (
        <StatusGroup caption="level">
          {Array.from({ length: levelCount }, (_, i) => i + 1).map((k) => (
            <StatusButton
              key={k}
              active={infomapStore.moduleLevel === k - 1}
              content={`Module level ${k}`}
              onClick={() => {
                infomapStore.setModuleLevel(k - 1, true);
                if (mapStore.renderType === 'bioregions') mapStore.render();
              }}
            >
              {k}
            </StatusButton>
          ))}
        </StatusGroup>
      )}

      <StatusGroup caption="boundaries">
        <StatusButton
          active={!mapStore.colorModuleParticipation}
          disabled={!isBioregions}
          content="Distinct — hard boundaries between bioregions"
          onClick={() => mapStore.setColorModuleParticipation(false)}
        >
          <BioregionsIcon r1={r1} r2={r2} />
        </StatusButton>
        <StatusButton
          active={mapStore.colorModuleParticipation}
          disabled={!isBioregions}
          content="Inter-connected — fuzzy transition zones between bioregions"
          onClick={() => mapStore.setColorModuleParticipation(true)}
        >
          <BoundariesFuzzyIcon r1={r1} r2={r2} />
        </StatusButton>
      </StatusGroup>

      <StatusGroup caption="clip">
        <StatusButton
          active={!mapStore.clipToLand}
          disabled={mapStore.renderType === 'records'}
          content="No clip — colors fill the ocean too"
          onClick={() => mapStore.setClipToLand(false)}
        >
          <BioregionsIcon r1={r1} r2={r2} />
        </StatusButton>
        <StatusButton
          active={mapStore.clipToLand}
          disabled={mapStore.renderType === 'records'}
          content="Clip to land — colors follow the coastline"
          onClick={() => mapStore.setClipToLand(true)}
        >
          <ClipOnIcon r1={r1} r2={r2} ocean={mapStore.waterColor} />
        </StatusButton>
      </StatusGroup>

      <StatusGroup caption="view">
        <StatusButton
          content="Reset view — the whole world"
          onClick={() => mapStore.resetView()}
        >
          <ResetViewIcon />
        </StatusButton>
        <StatusButton
          content="Fit to data — frame all grid cells"
          onClick={() => mapStore.fitToData()}
        >
          <FitDataIcon />
        </StatusButton>
      </StatusGroup>

      {/* One auto margin for the chip + settings pair so both sit at the right end (two
          separate auto margins would split the free space between them). */}
      <Box
        ml="auto"
        display="flex"
        alignItems="center"
        gap={3}
        alignSelf="flex-start"
        minW={0}
      >
        <SelectionChip />
        <StatusBarSettings />
      </Box>
    </StatusBar>
  );
});
