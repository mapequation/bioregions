import { Badge, Box, Button, Flex, Grid, HStack, Icon, Menu, Progress, Spinner, Text, VisuallyHidden } from '@chakra-ui/react';
import { reaction } from 'mobx';
import { observer } from 'mobx-react';
import { useEffect, useRef, useState } from 'react';
import { LuCheck, LuChevronDown, LuCircleX, LuMinimize2, LuPause, LuTrash2 } from 'react-icons/lu';
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

function statsText(p: SourceProgress): string {
  const parts = [`${fmtInt(p.fetched)} / ${fmtInt(p.expected)}`];
  if (p.speciesTotal) parts.push(`species ${fmtInt(p.speciesDone ?? 0)}/${fmtInt(p.speciesTotal)}`);
  parts.push(`req ${fmtInt(p.requestsDone)}/${fmtInt(p.requestsTotal)}`);
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
        <Progress.Root size="sm" value={null} aria-label={`${name}: planning`} aria-valuetext="Planning">
          <Progress.Track>
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
        aria-label={`${name} records received`}
        aria-valuetext={`${fmtInt(p.fetched)} of ${fmtInt(p.expected)} records`}
      >
        <Progress.Track>
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

const CancelMenu = observer(function CancelMenu() {
  const { explorerStore: ex } = useStore();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onEvent = () => setOpen(true);
    window.addEventListener(CANCEL_MENU_EVENT, onEvent);
    // Esc while streaming: the dialog bumps explorerUi.cancelMenuRequest.
    const stop = reaction(() => explorerUi.cancelMenuRequest, onEvent);
    return () => {
      window.removeEventListener(CANCEL_MENU_EVENT, onEvent);
      stop();
    };
  }, []);
  const accepted = ex.job?.funnel.accepted ?? 0;
  return (
    <Menu.Root
      // Mount the portalled content on open: the explorer dialog aria-hides body children present when it opens.
      lazyMount
      unmountOnExit
      open={open}
      onOpenChange={(e) => setOpen(e.open)}
      positioning={{ placement: 'top-end' }}
      onSelect={(e) => {
        if (e.value === 'keep' || e.value === 'discard') ex.cancel(e.value);
      }}
    >
      <Menu.Trigger asChild>
        <Button size="xs" variant="outline" data-testid="cancel-load">
          Cancel load <LuChevronDown />
        </Button>
      </Menu.Trigger>
      <Menu.Positioner>
        <Menu.Content minW="18rem">
          <Menu.Item value="keep" disabled={accepted === 0}>
            <Icon as={LuCheck} />
            <Box flex="1" fontVariantNumeric="tabular-nums">
              Keep {fmtInt(accepted)} records and run Infomap
            </Box>
          </Menu.Item>
          <Menu.Item value="discard" color="fg.error" _highlighted={{ bg: 'bg.error', color: 'fg.error' }}>
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

  const rows: (SourceProgress | { source: SourceId; planning: true })[] =
    job.perSource.length > 0
      ? job.perSource
      : (['gbif', 'obis'] as SourceId[])
          .filter((id) => ex.query.sources[id])
          .map((source) => ({ source, planning: true as const }));

  return (
    <Flex direction="column" gap={2} minH="7.25rem" data-testid="load-progress" aria-busy={active}>
      <HStack gap={3} minW={0}>
        <Spinner size="xs" color="colorPalette.solid" flexShrink={0} />
        <Text fontSize="sm" fontWeight="semibold" truncate minW={0} flex="1">
          {job.state === 'planning' ? 'Planning' : 'Loading'} “{job.label}”
        </Text>
        <Text fontSize="xs" color="fg.muted" fontVariantNumeric="tabular-nums" flexShrink={0}>
          {fmtDuration(elapsed)} elapsed
          <Box as="span" aria-hidden color="fg.muted" mx={1.5}>
            ·
          </Box>
          {job.etaSeconds != null ? `~${fmtDuration(job.etaSeconds)} left` : 'estimating time left'}
        </Text>
        <HStack gap={1.5} flexShrink={0}>
          <Button size="xs" variant="ghost" onClick={() => ex.setMinimized(true)}>
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
      <VisuallyHidden aria-live="polite">{announcement}</VisuallyHidden>
    </Flex>
  );
});
