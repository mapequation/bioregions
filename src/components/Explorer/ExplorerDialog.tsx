import { Box, Flex, HStack, Icon, IconButton, Kbd, Separator, Stack, Tabs, Text } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { LuCircleHelp, LuMinimize2, LuWifiOff, LuX } from 'react-icons/lu';
import { useStore } from '../../store';
import type { Tab } from '../../store/explorer/types';
import { DialogContent, DialogRoot, DialogTitle } from '../ui/dialog';
import { PopoverArrow, PopoverBody, PopoverContent, PopoverRoot, PopoverTitle, PopoverTrigger } from '../ui/popover';
import { Tooltip } from '../ui/tooltip';
import CiteTab from './cite/CiteTab';
import { explorerUi, TAXON_INPUT_SELECTOR } from './explorerUi';
import LibraryMenu from './library/LibraryMenu';
import OccurrencesTab from './OccurrencesTab';
import PhyloTab from './phylo/PhyloTab';
import SourceChips from './SourceChips';
import useExplorerShortcuts, { SHORTCUTS } from './useExplorerShortcuts';

const TABS: { value: Tab; label: string }[] = [
  { value: 'occurrences', label: 'Occurrences' },
  { value: 'phylogeny', label: 'Phylogeny' },
  { value: 'cite', label: 'Cite & reproduce' },
];

const ShortcutHelp = observer(function ShortcutHelp() {
  return (
    <PopoverRoot
      // Mount the portalled content on open: the explorer dialog aria-hides body children present when it opens.
      lazyMount
      unmountOnExit
      open={explorerUi.helpOpen}
      onOpenChange={(e) => explorerUi.setHelpOpen(e.open)}
      positioning={{ placement: 'bottom-end' }}
    >
      <Tooltip content="Keyboard shortcuts (?)" openDelay={400}>
        <Box display="inline-flex">
          <PopoverTrigger asChild>
            <IconButton aria-label="Keyboard shortcuts" size="xs" variant="ghost">
              <LuCircleHelp />
            </IconButton>
          </PopoverTrigger>
        </Box>
      </Tooltip>
      <PopoverContent w="320px">
        <PopoverArrow />
        <PopoverBody p={3}>
          <PopoverTitle fontSize="sm" fontWeight="semibold" mb={2}>
            Keyboard shortcuts
          </PopoverTitle>
          <Stack as="dl" gap={2} fontSize="sm">
            {SHORTCUTS.map((s) => (
              <Flex key={s.label} gap={3} align="flex-start">
                <HStack as="dt" gap={1} minW="88px" flexShrink={0}>
                  {s.keys.map((k) => (
                    <Kbd key={k} size="sm">
                      {k}
                    </Kbd>
                  ))}
                </HStack>
                <Text as="dd" color="fg.muted" lineHeight="short">
                  {s.label}
                </Text>
              </Flex>
            ))}
          </Stack>
          <Text mt={3} fontSize="xs" color="fg.muted">
            / and ? work when focus is not in a text field.
          </Text>
        </PopoverBody>
      </PopoverContent>
    </PopoverRoot>
  );
});

const OfflineBanner = observer(function OfflineBanner() {
  const { explorerStore } = useStore();
  if (explorerStore.online) return null;
  return (
    <HStack
      role="status"
      flexShrink={0}
      gap={2}
      px={4}
      py={1.5}
      fontSize="sm"
      bg="orange.subtle"
      color="orange.fg"
      borderBottomWidth="1px"
      borderColor="orange.muted"
    >
      <Icon as={LuWifiOff} boxSize={4} />
      <Text>You're offline. Previews paused; loaded data is kept.</Text>
    </HStack>
  );
});

/** Full-screen data explorer: header with tabs, source chips and library; one body per tab. */
export default observer(function ExplorerDialog() {
  const { explorerStore } = useStore();
  const open = explorerStore.isOpen && !explorerStore.minimized;
  const streaming = explorerStore.job?.state === 'planning' || explorerStore.job?.state === 'streaming';
  useExplorerShortcuts(open);

  // ✕ while streaming minimizes: the load continues and its progress shows in the Data section.
  const closeOrMinimize = () => {
    if (streaming) explorerStore.setMinimized(true);
    else explorerStore.close();
  };

  return (
    <DialogRoot
      size="full"
      open={open}
      motionPreset="none"
      closeOnInteractOutside={false}
      initialFocusEl={() => document.querySelector<HTMLElement>(TAXON_INPUT_SELECTOR)}
      onEscapeKeyDown={(e) => {
        // Popovers and menus consume Esc first (layered dismissal); this only fires when
        // nothing inside is open. Draw mode is the innermost "mode", so it ends first.
        if (explorerUi.drawing) {
          e.preventDefault();
          explorerUi.setDrawing(false);
        } else if (streaming) {
          e.preventDefault();
          explorerUi.requestCancelMenu();
        }
      }}
      onOpenChange={(e) => {
        if (!e.open) closeOrMinimize();
      }}
    >
      <DialogContent
        data-testid="explorer-dialog"
        h="100dvh"
        borderRadius={0}
        bg="bg"
        overflow="hidden"
        // The app's brand.solid (brand.500) fails 4.5:1 behind small button text; darken
        // solid brand buttons inside the explorer only (theme.ts is app-wide).
        css={{ '--chakra-colors-color-palette-solid': 'var(--chakra-colors-brand-600)' }}
      >
        <Tabs.Root
          value={explorerStore.tab}
          onValueChange={(e) => explorerStore.setTab(e.value as Tab)}
          size="sm"
          variant="line"
          lazyMount
          display="flex"
          flexDirection="column"
          h="full"
          minH={0}
        >
          <Flex
            as="header"
            h="44px"
            flexShrink={0}
            align="stretch"
            gap={{ base: 3, xl: 5 }}
            pl={4}
            pr={2}
            borderBottomWidth="1px"
            bg="bg"
          >
            <DialogTitle
              alignSelf="center"
              fontFamily="brand"
              fontSize="xl"
              fontWeight="bold"
              lineHeight="1"
              whiteSpace="nowrap"
              letterSpacing="tight"
            >
              Data explorer
            </DialogTitle>
            <Tabs.List borderBottomWidth={0} gap={1} css={{ '--tabs-height': '44px' }}>
              {TABS.map((t) => (
                <Tabs.Trigger
                  key={t.value}
                  value={t.value}
                  data-testid={`explorer-tab-${t.value}`}
                  px={3}
                  fontWeight="medium"
                  whiteSpace="nowrap"
                >
                  {t.label}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            <Box flex="1" minW={2} />
            <HStack gap={2} flexShrink={0}>
              <SourceChips />
              <Separator orientation="vertical" h={5} />
              <LibraryMenu />
              <ShortcutHelp />
              <Tooltip content={streaming ? 'Minimize: the load continues' : 'Minimize to the map'} openDelay={400}>
                <IconButton
                  aria-label="Minimize explorer"
                  size="xs"
                  variant="ghost"
                  data-testid="explorer-minimize"
                  onClick={() => explorerStore.setMinimized(true)}
                >
                  <LuMinimize2 />
                </IconButton>
              </Tooltip>
              <Tooltip content={streaming ? 'Close (the load continues in the background)' : 'Close (Esc)'} openDelay={400}>
                <IconButton
                  aria-label="Close explorer"
                  size="xs"
                  variant="ghost"
                  data-testid="explorer-close"
                  onClick={closeOrMinimize}
                >
                  <LuX />
                </IconButton>
              </Tooltip>
            </HStack>
          </Flex>
          <OfflineBanner />
          <Tabs.Content value="occurrences" flex="1" minH={0} p={0}>
            <OccurrencesTab />
          </Tabs.Content>
          <Tabs.Content value="phylogeny" flex="1" minH={0} p={0} overflowY="auto">
            <PhyloTab />
          </Tabs.Content>
          <Tabs.Content value="cite" flex="1" minH={0} p={0} overflowY="auto">
            <CiteTab />
          </Tabs.Content>
        </Tabs.Root>
      </DialogContent>
    </DialogRoot>
  );
});
