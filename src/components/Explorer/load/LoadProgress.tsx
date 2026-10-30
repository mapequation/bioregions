import { Badge, Box, Button, Flex, Grid, HStack, Icon, Menu, Progress, Spinner, Text, VisuallyHidden } from '@chakra-ui/react';
import { reaction } from 'mobx';
import { observer } from 'mobx-react';
import { useEffect, useRef, useState } from 'react';
import { LuCheck, LuChevronDown, LuCircleX, LuMinimize2, LuPause, LuPlay, LuSquare, LuTrash2 } from 'react-icons/lu';
import type { SourceId } from '@/sources/types';
import { useStore } from '@/store';
import type { SourceProgress } from '@/store/explorer/types';
import { explorerUi } from '../explorerUi';
import { fmtBytes, fmtDuration, fmtInt } from '../format';
import { progressPercent, secondsUntil } from './loadMath';

/** Window event that opens the cancel menu (Esc while streaming, from the shortcut hook). */
export const CANCEL_MENU_EVENT = 'explorer:cancel-menu';

const SOURCE_LABEL: Record<SourceId, string> = { gbif: 'GBIF', obis: 'OBIS' };
const ANNOUNCE_MS = 5000;

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  return now;
}

/** Whether a source has anything to fetch; 0 / 0 sources count as done. */
const hasWork = (p: SourceProgress) => p.requestsTotal > 0 || p.expected > 0 || p.fetched > 0;

/**
 * Whether the request total is final: species-by-species streams plan each species' requests
 * as they go, so the total moves (and can shrink) until every species is planned.
 */
export function requestsFinal(p: SourceProgress): boolean {
  if (p.state === 'done') return true;
  if (p.speciesTotal) return (p.speciesDone ?? 0) >= p.speciesTotal;
  // Before the first request the stream may still switch to species-by-species planning.
  return p.requestsDone > 0;
}

function statsText(p: SourceProgress): string {
  const parts = [`${fmtInt(p.fetched)} / ${fmtInt(p.expected)}`];
  if (p.speciesTotal) parts.push(`species ${fmtInt(p.speciesDone ?? 0)}/${fmtInt(p.speciesTotal)}`);
  // Never show a denominator that may still shrink.
  parts.push(
    requestsFinal(p) ? `req ${fmtInt(p.requestsDone)}/${fmtInt(p.requestsTotal)}` : `req ${fmtInt(p.requestsDone)}`,
  );
  if (p.bytes != null) parts.push(fmtBytes(p.bytes));
  return parts.join(' · ');
}

function SourceRow({ p, now }: { p: SourceProgress | { source: SourceId; planning: true }; now: number }) {
  const name = SOURCE_LABEL[p.source];
  if ('planning' in p) {
    return (
      <>
        <Badge size="sm" variant="surface" justifyContent="center">
          {name}
        </Badge>
        <Progress.Root size="sm" value={null}>
          <Progress.Track aria-label={`${name}: planning`} aria-valuetext="Planning">
            <Progress.Range />
          </Progress.Track>
        </Progress.Root>
        <Text fontSize="xs" color="fg.muted">
          Counting records and partitions…
        </Text>
        <Box />
      </>
    );
  }
  const pct = progressPercent(p.fetched, p.expected);
  const wait = p.state === 'rateLimited' ? secondsUntil(p.retryAt, now) : null;
  const palette = p.state === 'error' ? 'red' : p.state === 'rateLimited' ? 'orange' : 'brand';
  return (
    <>
      <Badge size="sm" variant="surface" justifyContent="center">
        {name}
      </Badge>
      <Progress.Root
        size="sm"
        colorPalette={palette}
        value={p.state === 'done' ? 100 : pct}
      >
        <Progress.Track
          aria-label={`${name} records received`}
          aria-valuetext={`${fmtInt(p.fetched)} of ${fmtInt(p.expected)} records`}
        >
          <Progress.Range transition="width 0.4s" />
        </Progress.Track>
      </Progress.Root>
      <Text fontSize="xs" color="fg.muted" fontVariantNumeric="tabular-nums" truncate title={statsText(p)}>
        {statsText(p)}
      </Text>
      <Box fontSize="xs" minW={0}>
        {p.state === 'rateLimited' && (
          <HStack gap={1} color="orange.fg" fontVariantNumeric="tabular-nums">
            <Icon as={LuPause} boxSize={3} flexShrink={0} />
            <Text truncate>
              {name} busy{wait != null ? `, retrying in ${wait} s` : ', retrying soon'}
            </Text>
          </HStack>
        )}
        {p.state === 'done' && (
          <HStack gap={1} color="fg.muted">
            <Icon as={LuCheck} boxSize={3} />
            <Text>Done</Text>
          </HStack>
        )}
        {p.state === 'error' && (
          <HStack gap={1} color="fg.error">
            <Icon as={LuCircleX} boxSize={3} />
            <Text truncate>Failed</Text>
          </HStack>
        )}
      </Box>
    </>
  );
}

/** Optional pause API on the store (added alongside this menu; guarded until every path has it). */
interface PausableStore {
  pauseLoad?: () => void;
  resumeLoad?: () => void;
}

type CancelChoice = 'keep' | 'continue' | 'discard';

const CancelMenu = observer(function CancelMenu() {
  const { explorerStore: ex } = useStore();
  const pausable = ex as unknown as PausableStore;
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  // Set when an item is chosen, so closing the menu by its choice does not also resume.
  const chose = useRef(false);
  const job = ex.job;
  // The load is paused while the menu is open, so these counts are what "Keep" keeps.
  const accepted = job?.funnel.accepted ?? 0;
  // Species with at least one kept record (what the loaded panel counts after a keep);
  // falls back to the streams' finished-species counts.
  const speciesDone = job?.speciesLoaded ?? job?.perSource.reduce((sum, p) => sum + (p.speciesDone ?? 0), 0) ?? 0;
  const speciesTotal =
    job?.speciesPlanned ?? job?.perSource.reduce((sum, p) => sum + (p.speciesTotal ?? 0), 0) ?? 0;
  const coverage = job?.speciesCoverage ?? (speciesTotal > 0 ? speciesDone / speciesTotal : null);
  // With under half the species loaded, the partial dataset is mostly missing: discard by default.
  const discardFirst = coverage != null && coverage < 0.5;
  const preferred: CancelChoice = discardFirst || accepted === 0 ? 'discard' : 'keep';
  const preferredRef = useRef(preferred);
  preferredRef.current = preferred;

  const openMenu = useRef(() => {});
  openMenu.current = () => {
    chose.current = false;
    pausable.pauseLoad?.call(ex);
    setOpen(true);
    setHighlighted(preferredRef.current);
  };
  const closeMenu = () => {
    setOpen(false);
    // Closed with Esc or a click outside: carry on loading.
    queueMicrotask(() => {
      if (!chose.current) pausable.resumeLoad?.call(ex);
    });
  };

  useEffect(() => {
    const onEvent = () => openMenu.current();
    window.addEventListener(CANCEL_MENU_EVENT, onEvent);
    // Esc while streaming: the dialog bumps explorerUi.cancelMenuRequest.
    const stop = reaction(() => explorerUi.cancelMenuRequest, onEvent);
    return () => {
      window.removeEventListener(CANCEL_MENU_EVENT, onEvent);
      stop();
    };
  }, []);

  const speciesText = speciesTotal > 0 ? ` (${fmtInt(speciesDone)} of ${fmtInt(speciesTotal)} species)` : '';
  return (
    <Menu.Root
      // Mount the portalled content on open: the explorer dialog aria-hides body children present when it opens.
      lazyMount
      unmountOnExit
      open={open}
      onOpenChange={(e) => {
        if (e.open) openMenu.current();
        else closeMenu();
      }}
      highlightedValue={highlighted}
      onHighlightChange={(e) => setHighlighted(e.highlightedValue)}
      positioning={{ placement: 'top-end' }}
      onSelect={(e) => {
        chose.current = true;
        if (e.value === 'continue') pausable.resumeLoad?.call(ex);
        else if (e.value === 'keep' || e.value === 'discard') ex.cancel(e.value);
      }}
    >
      <Menu.Trigger asChild>
        <Button size="sm" variant="outline" data-testid="cancel-load">
          Cancel load <LuChevronDown />
        </Button>
      </Menu.Trigger>
      <Menu.Positioner>
        <Menu.Content minW="20rem" maxW="26rem" data-testid="cancel-menu">
          <Menu.Item value="keep" disabled={accepted === 0} data-testid="cancel-keep">
            <Icon as={LuSquare} />
            <Box flex="1" fontVariantNumeric="tabular-nums">
              Keep {fmtInt(accepted)} records{speciesText} and stop
              {discardFirst && (
                <Text as="span" display="block" textStyle="xs" color="fg.muted">
                  Too few species for representative bioregions
                </Text>
              )}
            </Box>
          </Menu.Item>
          <Menu.Item value="continue" data-testid="cancel-continue">
            <Icon as={LuPlay} />
            <Box flex="1">Continue loading</Box>
          </Menu.Item>
          <Menu.Separator />
          <Menu.Item
            value="discard"
            colorPalette="red"
            color="colorPalette.fg"
            _highlighted={{ bg: 'colorPalette.subtle', color: 'colorPalette.fg' }}
            data-testid="cancel-discard"
          >
            <Icon as={LuTrash2} />
            <Box flex="1">Discard and restore previous data</Box>
          </Menu.Item>
        </Menu.Content>
      </Menu.Positioner>
    </Menu.Root>
  );
});

/** Live load progress: replaces the dock row while a load plans or streams. */
export default observer(function LoadProgress() {
  const { explorerStore: ex } = useStore();
  const job = ex.job;
  const active = !!job && (job.state === 'planning' || job.state === 'streaming');
  const now = useNow(active);
  const [announcement, setAnnouncement] = useState('');
  const lastAnnounce = useRef(0);

  const elapsed = job ? (now - job.startedAt) / 1000 : 0;
  const received = job?.perSource.reduce((s, p) => s + p.fetched, 0) ?? 0;
  const expected = job?.perSource.reduce((s, p) => s + p.expected, 0) ?? 0;
  const summary = job?.state === 'planning' ? 'Planning the load' : `${fmtInt(received)} of ${fmtInt(expected)} records received`;

  useEffect(() => {
    if (now - lastAnnounce.current >= ANNOUNCE_MS) {
      lastAnnounce.current = now;
      setAnnouncement(summary);
    }
  }, [now, summary]);

  if (!job) return null;

  // A source with nothing to fetch (0 records, 0 requests) is done before it starts: it gets
  // no progress row, only a static note.
  const hasPreview = (id: SourceId) => ex.previews.some((p) => p.source === id);
  const previewEmpty = (id: SourceId) => ex.previews.some((p) => p.source === id && p.total === 0);
  const rows: (SourceProgress | { source: SourceId; planning: true })[] =
    job.perSource.length > 0
      ? job.perSource.filter(hasWork)
      : (['gbif', 'obis'] as SourceId[])
          .filter((id) => ex.query.sources[id] && !previewEmpty(id))
          .map((source) => ({ source, planning: true as const }));
  const idle: SourceId[] =
    job.perSource.length > 0
      ? job.perSource.filter((p) => !hasWork(p)).map((p) => p.source)
      : (['gbif', 'obis'] as SourceId[]).filter((id) => ex.query.sources[id] && hasPreview(id) && previewEmpty(id));

  // Sources switched off are "off"; an enabled source with nothing to fetch had no matching records.
  const off: SourceId[] = (['gbif', 'obis'] as SourceId[]).filter(
    (id) => !ex.query.sources[id] && !job.perSource.some((p) => p.source === id && hasWork(p)),
  );
  const idleNote = [
    ...idle.filter((id) => !off.includes(id)).map((id) => `${SOURCE_LABEL[id]}: ${idleReason(id)}`),
    ...off.map((id) => `${SOURCE_LABEL[id]}: off`),
  ].join(' · ');
  const paused = (job as { paused?: boolean }).paused === true;
  // Same words as the source chip: OBIS knows none of the taxa vs. a query with no records.
  function idleReason(id: SourceId): string {
    const taxa = ex.query.taxa;
    const gbifOnly =
      id === 'obis' &&
      taxa.length > 0 &&
      taxa.every((t) => t.obisId == null || ex.sources.obis.gbifOnlyTaxa.includes(t.name));
    return gbifOnly ? 'no records for these taxa' : 'no matching records';
  }

  return (
    <Flex direction="column" gap={2} minH="7.25rem" data-testid="load-progress" aria-busy={active}>
      <HStack gap={3} minW={0}>
        {paused ? (
          <Icon as={LuPause} boxSize={3} color="fg.muted" flexShrink={0} aria-hidden />
        ) : (
          <Spinner size="xs" color="colorPalette.solid" flexShrink={0} />
        )}
        <Text fontSize="sm" fontWeight="semibold" truncate minW={0} flex="1" data-state={paused ? 'paused' : undefined}>
          {job.state === 'planning' ? 'Planning' : paused ? 'Paused' : 'Loading'} “{job.label}”
        </Text>
        <Text fontSize="xs" color="fg.muted" fontVariantNumeric="tabular-nums" flexShrink={0}>
          {fmtDuration(elapsed)} elapsed
          <Box as="span" aria-hidden color="fg.muted" mx={1.5}>
            ·
          </Box>
          {job.etaSeconds != null ? `~${fmtDuration(job.etaSeconds)} left` : 'estimating time left'}
        </Text>
        <HStack gap={1.5} flexShrink={0}>
          <Button size="sm" variant="ghost" onClick={() => ex.setMinimized(true)}>
            <LuMinimize2 /> Minimize
          </Button>
          <CancelMenu />
        </HStack>
      </HStack>
      <Grid
        templateColumns="3.25rem minmax(6rem, 1fr) minmax(0, 26rem) 11rem"
        columnGap={3}
        rowGap={2}
        alignItems="center"
      >
        {rows.map((p) => (
          <SourceRow key={p.source} p={p} now={now} />
        ))}
      </Grid>
      {idleNote && (
        <Text fontSize="xs" color="fg.muted" data-testid="load-progress-idle">
          {idleNote}
        </Text>
      )}
      <VisuallyHidden aria-live="polite">{announcement}</VisuallyHidden>
    </Flex>
  );
});
