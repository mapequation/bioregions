import {
  Badge,
  Box,
  Button,
  Flex,
  Grid,
  HStack,
  Icon,
  Popover,
  Portal,
  Progress,
  Spinner,
  Text,
  VisuallyHidden,
} from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { type ComponentProps, useEffect, useId, useRef, useState } from 'react';
import {
  LuCheck,
  LuChevronDown,
  LuChevronUp,
  LuCircleX,
  LuPause,
  LuPlay,
  LuSquare,
  LuTrash2,
} from 'react-icons/lu';
import type { SourceId } from '@/sources/types';
import { useStore } from '@/store';
import { explorerJob } from '@/store/ExplorerStore';
import type { SourceProgress } from '@/store/explorer/types';
import { fmtBytes, fmtDuration, fmtInt } from '../format';
import { progressPercent, secondsUntil } from './loadMath';

/** Window event that opens the cancel popover (Esc while streaming, from the shortcut hook). */
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

/** Choice row in the cancel popover: equal weight, nothing pre-selected, label and an optional note. */
function ChoiceButton({
  icon,
  label,
  note,
  danger,
  ...rest
}: {
  icon: typeof LuPlay;
  label: string;
  note?: string;
  danger?: boolean;
} & ComponentProps<typeof Button>) {
  return (
    <Button
      size="sm"
      variant="outline"
      colorPalette={danger ? 'red' : 'gray'}
      color={danger ? 'colorPalette.fg' : 'fg'}
      borderColor="border.emphasized"
      justifyContent="flex-start"
      alignItems="flex-start"
      textAlign="start"
      whiteSpace="normal"
      h="auto"
      minH={9}
      py={2}
      gap={2.5}
      w="full"
      focusVisibleRing="outside"
      _hover={{ bg: danger ? 'colorPalette.subtle' : 'bg.muted' }}
      {...rest}
    >
      <Icon as={icon} boxSize={4} mt="1px" flexShrink={0} aria-hidden />
      <Box flex="1" minW={0} fontVariantNumeric="tabular-nums">
        {label}
        {note && (
          <Text as="span" display="block" textStyle="xs" color="fg.muted" fontWeight="normal" mt={0.5}>
            {note}
          </Text>
        )}
      </Box>
    </Button>
  );
}

/**
 * "Cancel load" opens (on click only) a popover with three explicit choices. The load is paused
 * while it is open and resumes when it closes without a choice (Esc, click outside, trigger).
 */
const CancelPopover = observer(function CancelPopover() {
  const { dataStore } = useStore();
  const [open, setOpen] = useState(false);
  const continueRef = useRef<HTMLButtonElement>(null);
  // Set when a choice is made, so closing the popover by its choice does not also resume.
  const chose = useRef(false);
  const job = explorerJob(dataStore.job);
  const continuing = job?.kind === 'continue';
  // The load is paused while the popover is open, so these counts are what "Keep" keeps.
  const accepted = job?.funnel.accepted ?? 0;
  // Species with at least one kept record (what the loaded panel counts after a keep);
  // falls back to the streams' finished-species counts.
  const speciesDone = job?.speciesLoaded ?? job?.perSource.reduce((sum, p) => sum + (p.speciesDone ?? 0), 0) ?? 0;
  const speciesTotal =
    job?.speciesPlanned ?? job?.perSource.reduce((sum, p) => sum + (p.speciesTotal ?? 0), 0) ?? 0;
  const coverage = job?.speciesCoverage ?? (speciesTotal > 0 ? speciesDone / speciesTotal : null);
  const fewSpecies = coverage != null && coverage < 0.5;

  const openPopover = useRef(() => {});
  openPopover.current = () => {
    chose.current = false;
    dataStore.pause();
    setOpen(true);
  };
  const dismiss = () => {
    setOpen(false);
    // Closed with Esc, a click outside or the trigger: carry on loading.
    queueMicrotask(() => {
      if (!chose.current) dataStore.resume();
    });
  };
  const choose = (choice: 'continue' | 'keep' | 'discard') => {
    chose.current = true;
    setOpen(false);
    if (choice === 'continue') dataStore.resume();
    else dataStore.cancel(choice);
  };

  useEffect(() => {
    const onEvent = () => openPopover.current();
    window.addEventListener(CANCEL_MENU_EVENT, onEvent);
    return () => window.removeEventListener(CANCEL_MENU_EVENT, onEvent);
  }, []);

  const speciesText = speciesTotal > 0 ? ` (${fmtInt(speciesDone)} of ${fmtInt(speciesTotal)} species)` : '';
  return (
    <Popover.Root
      // Mount the portalled content on open: the explorer dialog aria-hides body children present when it opens.
      lazyMount
      unmountOnExit
      open={open}
      onOpenChange={(e) => {
        if (e.open) openPopover.current();
        else dismiss();
      }}
      initialFocusEl={() => continueRef.current}
      positioning={{ placement: 'top-end', gutter: 8 }}
    >
      <Popover.Trigger asChild>
        <Button size="sm" variant="outline" data-testid="cancel-load">
          <LuSquare /> Cancel load
        </Button>
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content w="24rem" maxW="calc(100vw - 2rem)" data-testid="cancel-menu">
            <Popover.Body p={3} display="flex" flexDirection="column" gap={2}>
              <Box>
                <Popover.Title fontSize="sm" fontWeight="semibold">
                  Stop this load?
                </Popover.Title>
                <Popover.Description fontSize="xs" color="fg.muted">
                  Loading is paused until you choose.
                </Popover.Description>
              </Box>
              <ChoiceButton
                ref={continueRef}
                icon={LuPlay}
                label="Continue loading"
                onClick={() => choose('continue')}
                data-testid="cancel-continue"
              />
              {continuing ? (
                // Stopping a Continue keeps what it added; a later Continue starts from there.
                <ChoiceButton
                  icon={LuSquare}
                  label={`Keep ${fmtInt(accepted)} new ${accepted === 1 ? 'record' : 'records'} and stop`}
                  note="Continue loading can pick up from here later"
                  onClick={() => choose('keep')}
                  data-testid="cancel-keep"
                />
              ) : (
                <>
                  <ChoiceButton
                    icon={LuSquare}
                    label={`Keep ${fmtInt(accepted)} records${speciesText} and stop`}
                    note={
                      accepted === 0
                        ? 'Nothing received yet'
                        : [
                            fewSpecies ? 'Under half the species: too few for representative bioregions.' : '',
                            // Only a query load keeps the cursors that Continue resumes from.
                            job?.kind === 'query' ? 'Continue loading can fetch the rest later.' : '',
                          ]
                            .filter(Boolean)
                            .join(' ') || undefined
                    }
                    disabled={accepted === 0}
                    onClick={() => choose('keep')}
                    data-testid="cancel-keep"
                  />
                  <ChoiceButton
                    icon={LuTrash2}
                    danger
                    label="Discard and restore previous data"
                    onClick={() => choose('discard')}
                    data-testid="cancel-discard"
                  />
                </>
              )}
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
});

/**
 * Live load progress. The dock keeps one row (status, totals, actions) so its height does not
 * change; the per-source rows open as a sheet overlaid above the dock.
 */
export default observer(function LoadProgress() {
  const { explorerStore: ex, dataStore } = useStore();
  const job = explorerJob(dataStore.job);
  const active = !!job && (job.state === 'planning' || job.state === 'streaming');
  const now = useNow(active);
  const [announcement, setAnnouncement] = useState('');
  const [details, setDetails] = useState(true);
  const sheetId = useId();
  const lastAnnounce = useRef(0);

  const elapsed = job ? (now - job.startedAt) / 1000 : 0;
  const received = job?.perSource.reduce((s, p) => s + p.fetched, 0) ?? 0;
  const expected = job?.perSource.reduce((s, p) => s + p.expected, 0) ?? 0;
  const planning = job?.state === 'planning' || (job?.perSource.length ?? 0) === 0;
  const summary = planning ? 'Planning the load' : `${fmtInt(received)} of ${fmtInt(expected)} records received`;

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
  const busySource = job.perSource.find((p) => p.state === 'rateLimited');
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
    <Box position="relative">
      {details && (
        <Flex
          id={sheetId}
          direction="column"
          gap={2}
          position="absolute"
          // Flush with the dock's top edge (the dock has py={2} around this box).
          bottom="calc(100% + var(--chakra-spacing-2))"
          right={0}
          w="min(60rem, 100%)"
          zIndex="docked"
          bg="bg.panel"
          borderWidth="1px"
          borderBottomWidth={0}
          borderTopRadius="md"
          boxShadow="md"
          px={3}
          pt={2.5}
          pb={3}
          data-testid="load-progress-sheet"
        >
          <Grid
            templateColumns="3.25rem minmax(8rem, 1fr) minmax(0, max-content) minmax(0, 10rem)"
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
        </Flex>
      )}
      <HStack gap={3} minW={0} minH={10} data-testid="load-progress" aria-busy={active}>
        {paused ? (
          <Icon as={LuPause} boxSize={4} color="fg.muted" flexShrink={0} aria-hidden />
        ) : (
          <Spinner size="sm" color="colorPalette.solid" flexShrink={0} />
        )}
        <Text fontSize="sm" fontWeight="semibold" truncate minW={0} flex="1" data-state={paused ? 'paused' : undefined}>
          {/* A Continue job's label already says "Continuing …". */}
          {job.kind === 'continue'
            ? `${paused ? 'Paused: ' : ''}${job.label}`
            : `${job.state === 'planning' ? 'Planning' : paused ? 'Paused' : 'Loading'} “${job.label}”`}
        </Text>
        <Text fontSize="xs" color="fg.muted" fontVariantNumeric="tabular-nums" flexShrink={0} whiteSpace="nowrap">
          {busySource ? (
            <Box as="span" color="orange.fg">
              {SOURCE_LABEL[busySource.source]} busy, retrying
            </Box>
          ) : planning ? (
            'Counting records…'
          ) : (
            `${fmtInt(received)} / ${fmtInt(expected)} records`
          )}
          <Box as="span" aria-hidden mx={1.5}>
            ·
          </Box>
          {fmtDuration(elapsed)} elapsed
          <Box as="span" aria-hidden mx={1.5}>
            ·
          </Box>
          {paused ? 'paused' : job.etaSeconds != null ? `~${fmtDuration(job.etaSeconds)} left` : 'estimating time left'}
        </Text>
        <HStack gap={1.5} flexShrink={0}>
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={details}
            // The chevron shows the state; an expanded fill would read like a second primary action.
            _expanded={{ bg: 'transparent', _hover: { bg: 'colorPalette.subtle' } }}
            aria-controls={details ? sheetId : undefined}
            onClick={() => setDetails((d) => !d)}
            data-testid="load-progress-details"
          >
            {details ? <LuChevronDown /> : <LuChevronUp />} Details
          </Button>
          <CancelPopover />
        </HStack>
      </HStack>
      <VisuallyHidden aria-live="polite">{announcement}</VisuallyHidden>
    </Box>
  );
});
