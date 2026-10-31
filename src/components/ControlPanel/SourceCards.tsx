import { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react';
import { LuChevronDown, LuEllipsis } from 'react-icons/lu';
import { Badge, Box, Button, HStack, IconButton, Menu, Popover, Portal, Progress, Stack, Text } from '@chakra-ui/react';
import { useStore } from '../../store';
import type { Tab } from '../../store/explorer/types';
import { Tooltip } from '../ui/tooltip';
import { secondaryButtonProps } from '../Explorer/buttonStyles';
import { type CardAction, type SourceCardModel, sourceCards } from './cards';

const TONE_COLOR = { info: 'fg.muted', warning: 'orange.fg', error: 'fg.error' } as const;

/** A text button with its tooltip; a disabled one shows the reason and stays focusable via its wrapper. */
function ActionButton({ action, onRun, full }: { action: CardAction; onRun: () => void; full?: boolean }) {
  const button = (
    <Button
      {...secondaryButtonProps}
      size="xs"
      flex={full ? undefined : '1'}
      w={full ? 'full' : undefined}
      disabled={!!action.disabled}
      onClick={onRun}
      data-testid={`card-${action.id}`}
    >
      {action.label}
    </Button>
  );
  return (
    <Tooltip content={action.disabled ?? action.tooltip} openDelay={300}>
      {action.disabled ? (
        <Box as="span" display="flex" flex={full ? undefined : '1'} tabIndex={0}>
          {button}
        </Box>
      ) : (
        button
      )}
    </Tooltip>
  );
}

/** "Stop ▾": holds the stream while open, so the counts it shows are what "keep" keeps. */
const StopMenu = observer(function StopMenu({ card }: { card: SourceCardModel }) {
  const { dataStore } = useStore();
  const chose = useRef(false);
  return (
    <Menu.Root
      onOpenChange={(e) => {
        if (e.open) {
          chose.current = false;
          dataStore.pause();
        } else {
          queueMicrotask(() => {
            if (!chose.current) dataStore.resume();
          });
        }
      }}
      onSelect={(e) => {
        chose.current = true;
        dataStore.cancel(e.value === 'discard' ? 'discard' : 'keep');
      }}
    >
      <Tooltip content="Stop the load: keep what arrived, or cancel it" openDelay={300}>
        <Menu.Trigger asChild>
          <Button size="xs" variant="outline" colorPalette="red" flex="1" data-testid="card-stop">
            Stop <LuChevronDown />
          </Button>
        </Menu.Trigger>
      </Tooltip>
      <Portal>
        <Menu.Positioner>
          <Menu.Content>
            {card.stopOptions?.map((o) => (
              <Menu.Item key={o.mode} value={o.mode} color={o.mode === 'discard' ? 'fg.error' : undefined}>
                {o.label}
              </Menu.Item>
            ))}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
});

const SourceCard = observer(function SourceCard({ card }: { card: SourceCardModel }) {
  const { explorerStore, dataStore } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  // Remove swaps the popover's content: move focus onto the confirm button.
  useEffect(() => {
    if (!confirming) return;
    const id = setTimeout(() => confirmRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [confirming]);

  const run = (id: CardAction['id']) => {
    if (id !== 'remove') setMenuOpen(false);
    switch (id) {
      case 'edit':
        return explorerStore.open('search');
      case 'cite':
        return explorerStore.open('cite');
      case 'replace':
        return explorerStore.open('upload');
      case 'examples':
        return explorerStore.open('examples');
      case 'change':
        return explorerStore.open('phylogeny');
      case 'open':
        return card.openTab && card.openTab !== 'sidebar' ? explorerStore.open(card.openTab as Tab) : undefined;
      case 'continue':
        return void dataStore.continueLoad('sidebar');
      case 'loadAgain':
        return void dataStore.loadAgain('sidebar');
      case 'remove':
        return setConfirming(true);
      case 'stop':
        return undefined;
    }
  };
  const remove = () => {
    setConfirming(false);
    setMenuOpen(false);
    if (card.role === 'tree') void dataStore.removeTree();
    else dataStore.removeOccurrences();
  };

  const buttons = card.primary.filter((a) => a.id !== 'continue');
  const cont = card.primary.find((a) => a.id === 'continue');
  const isJob = card.role === 'job' || card.progress != null;
  const progress = card.progress;

  return (
    <Stack
      gap={1.5}
      p={2.5}
      borderWidth="1px"
      borderRadius="md"
      bg={isJob ? 'bg.subtle' : undefined}
      role={isJob ? 'status' : undefined}
      aria-label={isJob ? card.title : undefined}
      data-testid={`source-card-${card.role}`}
    >
      <HStack gap={1.5} fontSize="xs" color="fg.muted">
        <Text flex="1" minW={0} truncate>
          {card.kindLabel}
        </Text>
        {card.badges.map((b) => (
          <Tooltip key={b.text} content={b.tooltip} openDelay={300}>
            <Badge size="sm" variant="subtle" tabIndex={0} aria-label={`${b.text}: ${b.tooltip}`}>
              {b.text}
            </Badge>
          </Tooltip>
        ))}
      </HStack>
      <Text fontSize="sm" fontWeight="medium" lineClamp={2} title={card.title}>
        {card.title}
      </Text>
      {card.stats.map((s) => (
        <Text key={s} fontSize="xs" color="fg.muted" fontVariantNumeric="tabular-nums">
          {s}
        </Text>
      ))}
      {card.status && (
        <Text fontSize="xs" color={TONE_COLOR[card.status.tone]}>
          {card.status.text}
        </Text>
      )}
      {card.notes.map((n) => (
        <Text key={n} fontSize="xs" color="fg.muted">
          {n}
        </Text>
      ))}
      {progress && (
        <>
          <Progress.Root
            size="xs"
            value={progress.value}
            max={progress.max ?? undefined}
            aria-label={`${card.title}: progress`}
            aria-valuetext={progress.text}
          >
            <Progress.Track>
              <Progress.Range />
            </Progress.Track>
          </Progress.Root>
          <Text fontSize="xs" color="fg.muted" fontVariantNumeric="tabular-nums" aria-hidden>
            {progress.text}
          </Text>
        </>
      )}
      {(buttons.length > 0 || card.menu.length > 0) && (
        <HStack gap={2}>
          {buttons.map((a) =>
            a.id === 'stop' ? (
              <StopMenu key={a.id} card={card} />
            ) : (
              <ActionButton key={a.id} action={a} onRun={() => run(a.id)} />
            ),
          )}
          {card.menu.length > 0 && (
            // The ⋯ actions open in a popover of text buttons; Remove swaps its content for the
            // confirmation, with focus on the confirm button and back on ⋯ when it closes.
            <Popover.Root
              lazyMount
              unmountOnExit
              open={menuOpen}
              onOpenChange={(e) => {
                setMenuOpen(e.open);
                if (!e.open) setConfirming(false);
              }}
              initialFocusEl={() => confirmRef.current ?? firstItemRef.current}
              finalFocusEl={() => moreRef.current}
              positioning={{ placement: 'bottom-end', gutter: 6 }}
            >
              <Tooltip content={`More actions for ${card.title}`} openDelay={300}>
                <Popover.Trigger asChild>
                  <IconButton ref={moreRef} size="xs" variant="ghost" flexShrink={0} aria-label={`More actions for ${card.title}`}>
                    <LuEllipsis />
                  </IconButton>
                </Popover.Trigger>
              </Tooltip>
              <Portal>
                <Popover.Positioner>
                  <Popover.Content w="auto" maxW="18rem">
                    <Popover.Body p={1.5} display="flex" flexDirection="column" gap={1}>
                      {confirming ? (
                        <HStack gap={3} p={1.5}>
                          <Text fontSize="sm">{card.removePrompt}</Text>
                          <Button ref={confirmRef} size="xs" colorPalette="red" onClick={remove} data-testid="card-remove-confirm">
                            Remove
                          </Button>
                        </HStack>
                      ) : (
                        card.menu.map((a, i) => (
                          <Button
                            key={a.id}
                            ref={i === 0 ? firstItemRef : undefined}
                            variant="ghost"
                            size="sm"
                            h="auto"
                            py={1.5}
                            justifyContent="flex-start"
                            textAlign="start"
                            disabled={!!a.disabled}
                            onClick={() => run(a.id)}
                            data-testid={`card-${a.id}`}
                          >
                            <Stack gap={0} align="start">
                              <Text>{a.label}</Text>
                              <Text fontSize="xs" color="fg.muted" whiteSpace="normal" fontWeight="normal">
                                {a.disabled ?? a.tooltip}
                              </Text>
                            </Stack>
                          </Button>
                        ))
                      )}
                    </Popover.Body>
                  </Popover.Content>
                </Popover.Positioner>
              </Portal>
            </Popover.Root>
          )}
        </HStack>
      )}
      {cont && <ActionButton action={cont} onRun={() => run('continue')} full />}
    </Stack>
  );
});

/** The sidebar's source cards, derived only from `dataStore.sources` and the running jobs (§5.5). */
export default observer(function SourceCards() {
  const { dataStore, speciesStore, infomapStore } = useStore();
  const cards = sourceCards({
    sources: dataStore.sources,
    job: dataStore.job,
    treeJob: dataStore.treeJob,
    overlap: dataStore.treeOverlap,
    counts: {
      records: speciesStore.numRecords,
      species: speciesStore.numSpecies,
      polygons: speciesStore.numPolygonsDebounced,
    },
    includeTree: infomapStore.includeTreeInNetwork,
    continueCap: dataStore.continueCap,
  });
  if (cards.length === 0) return null;
  return (
    <Stack gap={2}>
      {cards.map((card) => (
        <SourceCard key={card.key} card={card} />
      ))}
    </Stack>
  );
});
