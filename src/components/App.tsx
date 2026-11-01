import { useEffect, useRef, useState } from 'react';
import { VStack, Box, Text, VisuallyHidden } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { reaction } from 'mobx';
import WorldMap from './WorldMap';
import ControlPanel from './ControlPanel';
import { controlPanelWidth } from './ControlPanel/ControlPanel';
import { useStore } from '../store';
import Statistics from './Statistics';
import Documentation from './Documentation';
import { DataPortal } from './Explorer';
import ColorMode from './ControlPanel/ColorMode';
import TreeStatusBar from './StatusBar/TreeStatusBar';
import SelectionBar from './SelectionBar';
import { formatThousands } from '../utils/formats';
import { ASPECT_RATIO, MAX_WIDTH } from '../responsive';

// Tooltip for the hovered tree branch/node: the clade's reconstructed ancestral range,
// each bioregion sized by its share of the clade's occurrences. The matching bioregions are
// simultaneously emphasized on the map (see TreeStore.onHover / MapStore.highlightBioregions).
const TreeTooltip = observer(function _TreeTooltip() {
  const { treeStore } = useStore();
  const info = treeStore.hoverInfo;
  if (!info) {
    return null;
  }
  const [x, y] = treeStore.hoverPos;
  return (
    <Box
      position="absolute"
      left={`${x + 12}px`}
      top={`${y + 12}px`}
      pointerEvents="none"
      bg="bg.panel"
      color="fg"
      borderWidth="1px"
      borderColor="border"
      borderRadius="md"
      px={2.5}
      py={2}
      fontSize="xs"
      lineHeight="1.45"
      zIndex={10}
      boxShadow="md"
      maxW="300px"
    >
      {info.name && (
        <Text fontWeight="600" truncate>
          {info.name}
        </Text>
      )}
      <Text color="fg.muted" mb={1}>
        Ancestral range · {formatThousands(info.speciesCount)} tips
      </Text>
      {info.regions.map((r) => (
        <Box key={r.clusterId} display="flex" alignItems="center" gap={1.5}>
          <Box
            w="10px"
            h="10px"
            borderRadius="2px"
            bg={r.color}
            flexShrink={0}
          />
          <Text flex={1}>Bioregion {r.clusterId}</Text>
          <Text color="fg.muted">{Math.round(r.fraction * 100)}%</Text>
        </Box>
      ))}
    </Box>
  );
});

// Shown only when collision thinning dropped tip labels that are in view (large trees, or a
// small tree in a short box): says how many and how to reveal them.
const TreeLabelHint = observer(function _TreeLabelHint() {
  const { treeStore } = useStore();
  const hidden = treeStore.hiddenLabels;
  if (hidden === 0) {
    return null;
  }
  return (
    <Text
      position="absolute"
      left={2}
      bottom={1}
      px={1.5}
      borderRadius="l1"
      bg="bg/80"
      color="fg.muted"
      fontSize="xs"
      fontVariantNumeric="tabular-nums"
      pointerEvents="none"
      data-testid="tree-labels-hidden"
    >
      +{formatThousands(hidden)} {hidden === 1 ? 'label' : 'labels'} hidden, zoom in to show
    </Text>
  );
});

const PhyloTree = observer(function _PhyloTree() {
  const { treeStore } = useStore();
  const hostRef = useRef<HTMLDivElement>(null);
  const haveTree = treeStore.haveTree;

  useEffect(() => {
    if (!haveTree || hostRef.current === null) {
      return;
    }
    treeStore.setHost(hostRef.current);
    return () => treeStore.disposeEngine();
  }, [treeStore, haveTree]);

  if (!haveTree) {
    return null;
  }

  return (
    <Box ml={4} width="calc(100% - var(--chakra-spacing-4))" maxW={`${MAX_WIDTH}px`}>
      <TreeStatusBar />
      {/* Responsive wrapper: fills the available width (capped at MAX_WIDTH) and keeps a 2:1 box
          via aspect-ratio. The d3gl host fills it (inset:0) and resizes in place; the hover
          tooltip lives in the same coordinate space as the d3gl pointer offsets. */}
      <Box position="relative" width="100%" aspectRatio={ASPECT_RATIO}>
        <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
        <TreeLabelHint />
        <TreeTooltip />
      </Box>
    </Box>
  );
});

// Where Escape should keep its local meaning (editing text, closing a dialog or popover).
function escapeIsLocal(ev: KeyboardEvent) {
  if (ev.defaultPrevented) return true;
  const el = document.activeElement as HTMLElement | null;
  if (el && (el.isContentEditable || el.closest('input, textarea, select')))
    return true;
  // Chakra keeps closed dialog/popover content mounted, so only count open ones.
  return (
    document.querySelector(
      ':is([role="dialog"], [role="alertdialog"]):not([data-state="closed"]):not([hidden])',
    ) !== null
  );
}

/** Escape clears the bioregion selection (and any list preview) anywhere on the page. */
function useEscapeClearsSelection() {
  const { selectionStore } = useStore();
  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || escapeIsLocal(ev)) return;
      if (
        selectionStore.selectedId === null &&
        selectionStore.previewId === null
      )
        return;
      selectionStore.select(null);
      selectionStore.preview(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectionStore]);
}

/** Screen-reader announcement of selection changes (silent until the first change). */
function SelectionAnnouncer() {
  const { selectionStore, infomapStore } = useStore();
  const [message, setMessage] = useState('');
  useEffect(
    () =>
      reaction(
        () => selectionStore.selectedId,
        (id) => {
          const b = infomapStore.bioregions.find((r) => r.bioregionId === id);
          setMessage(
            id === null
              ? 'Selection cleared'
              : `Bioregion ${id} selected${b ? `, ${formatThousands(b.numGridCells)} cells` : ''}`,
          );
        },
      ),
    [selectionStore, infomapStore],
  );
  return (
    <VisuallyHidden aria-live="polite" aria-atomic="true">
      {message}
    </VisuallyHidden>
  );
}

export default observer(function App() {
  useEscapeClearsSelection();
  return (
    <Box>
      <SelectionAnnouncer />
      <Box position="fixed" right={0}>
        <ColorMode />
      </Box>
      <ControlPanel />
      <VStack
        flex={1}
        alignItems="flex-start"
        ml={controlPanelWidth + 25}
        // Keep content clear of the fixed color-mode toggle in the top-right corner.
        pr={10}
        pt={5}
        pb={12}
      >
        <WorldMap />
        <PhyloTree />
        <Statistics />
        <Documentation />
      </VStack>
      <DataPortal />
      <SelectionBar />
    </Box>
  );
});
