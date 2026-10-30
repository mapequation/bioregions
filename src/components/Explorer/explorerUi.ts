// View-only state of the explorer shell that several packages share but that does not
// belong in ExplorerStore (nothing here affects the query, the preview or the load).
//
// Readers:
// - preview/PreviewMap reads `drawing` (AreaPicker's Draw toggle) and calls
//   `setDrawing(false)` once a rectangle is committed with explorerStore.setArea.
// - preview/KpiStrip renders the "Insights · ⚠ n" button when `useInsightsDrawer()` is
//   true (below 1280 px) and calls `setInsightsOpen(true)`; OccurrencesTab owns the Drawer.
// - load/LoadProgress opens its cancel menu when `cancelMenuRequest` changes (Esc while
//   streaming bumps it).
import { useBreakpointValue } from '@chakra-ui/react';
import { makeAutoObservable } from 'mobx';

class ExplorerUi {
  /** Rectangle draw mode on the preview map. */
  drawing = false;
  /** Insights drawer (only used below 1280 px). */
  insightsOpen = false;
  /** Shortcut help popover in the header. */
  helpOpen = false;
  /** Incremented to ask the load progress to open its cancel menu. */
  cancelMenuRequest = 0;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  setDrawing(on: boolean) {
    this.drawing = on;
  }

  setInsightsOpen(open: boolean) {
    this.insightsOpen = open;
  }

  setHelpOpen(open: boolean) {
    this.helpOpen = open;
  }

  requestCancelMenu() {
    this.cancelMenuRequest += 1;
  }
}

export const explorerUi = new ExplorerUi();

/** True below 1280 px, where the insights column becomes a drawer. */
export function useInsightsDrawer(): boolean {
  return useBreakpointValue({ base: true, xl: false }, { ssr: false }) ?? false;
}

export const TAXON_INPUT_SELECTOR = '[data-testid="taxon-input"]';

/** Move focus to the taxon search, if it is on screen. */
export function focusTaxonSearch(): boolean {
  const el = document.querySelector<HTMLInputElement>(TAXON_INPUT_SELECTOR);
  if (!el) return false;
  el.focus();
  return true;
}
