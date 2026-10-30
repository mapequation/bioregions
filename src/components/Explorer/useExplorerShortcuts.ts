// Keyboard shortcuts of the explorer (spec section 8):
// - `/` focuses the taxon search and `?` opens the shortcut list, only when focus is
//   not in a text field;
// - Mod+Enter loads (from anywhere, also from text fields);
// - Esc is handled by the dialog itself (ExplorerDialog onEscapeKeyDown).
import { useEffect } from 'react';
import { useStore } from '../../store';
import { explorerUi, focusTaxonSearch } from './explorerUi';

export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD_KEY_LABEL = IS_MAC ? '⌘' : 'Ctrl';

export interface Shortcut {
  keys: string[];
  label: string;
}

export const SHORTCUTS: Shortcut[] = [
  { keys: ['/'], label: 'Search taxa' },
  { keys: [MOD_KEY_LABEL, 'Enter'], label: 'Load records' },
  { keys: ['Esc'], label: 'Close a menu, the cancel menu while loading, else the explorer' },
  { keys: ['?'], label: 'Show these shortcuts' },
];

/** True when typing in `target` would insert text, so single-key shortcuts must not fire. */
export function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'file', 'color'].includes(target.type);
  }
  return target.getAttribute('role') === 'combobox';
}

/** Install the explorer's shortcuts while `active`. */
export default function useExplorerShortcuts(active: boolean): void {
  const { explorerStore } = useStore();
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        if (explorerStore.tab === 'occurrences' && explorerStore.canLoad.ok) {
          e.preventDefault();
          void explorerStore.load();
        }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTextEntry(e.target)) return;
      if (e.key === '/') {
        if (explorerStore.tab !== 'occurrences') explorerStore.setTab('occurrences');
        e.preventDefault();
        // The tab may need a frame to mount its content.
        if (!focusTaxonSearch()) requestAnimationFrame(() => focusTaxonSearch());
      } else if (e.key === '?') {
        e.preventDefault();
        explorerUi.setHelpOpen(!explorerUi.helpOpen);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, explorerStore]);
}
