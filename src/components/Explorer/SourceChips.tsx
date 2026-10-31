import { Box, Button, HStack, Icon, IconButton, Spinner, Stack, Text } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { useEffect, useState } from 'react';
import { LuBan, LuCheck, LuClock, LuRotateCw, LuTriangleAlert } from 'react-icons/lu';
import { SOURCES } from '@/sources';
import type { SourceId } from '@/sources/types';
import { useStore } from '../../store';
import type { SourceState } from '../../store/explorer/types';
import { Tooltip } from '../ui/tooltip';

const IDS: SourceId[] = ['gbif', 'obis'];

/** Seconds until `at` (epoch ms), ticking once per second while it is in the future. */
export function useCountdown(at: number | undefined): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (at == null) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [at]);
  if (at == null) return null;
  return Math.max(0, Math.ceil((at - now) / 1000));
}

type ChipStatus = 'off' | 'unsupported' | 'idle' | 'loading' | 'ready' | 'error' | 'rateLimited' | 'empty';

/**
 * `empty`: on, but this source has nothing for the query (OBIS knows none of the taxa, or its
 * preview counted 0 records). The chip stays toggleable; it only stops looking like a contributor.
 */
function chipStatus(enabled: boolean, s: SourceState, noTaxa: boolean): ChipStatus {
  if (!enabled) return 'off';
  if (!s.supports.ok) return 'unsupported';
  if (noTaxa && s.state !== 'error' && s.state !== 'rateLimited') return 'empty';
  if (s.state === 'ready' && s.preview?.total === 0) return 'empty';
  return s.state;
}

const STATUS_WORD: Record<ChipStatus, string> = {
  off: 'switched off',
  unsupported: 'not used for this query',
  idle: 'on',
  loading: 'updating',
  ready: 'ready',
  error: 'preview failed',
  rateLimited: 'busy, retrying',
  empty: 'on, but nothing matches this query',
};

function StatusMark({ status }: { status: ChipStatus }) {
  switch (status) {
    case 'loading':
      return <Spinner size="xs" color="fg.muted" borderWidth="1.5px" />;
    case 'error':
      return <Icon as={LuTriangleAlert} color="red.fg" boxSize={3.5} />;
    case 'rateLimited':
      return <Icon as={LuClock} color="orange.fg" boxSize={3.5} />;
    case 'unsupported':
      return <Icon as={LuBan} color="fg.muted" boxSize={3.5} />;
    case 'off':
      return <Box boxSize={2} borderRadius="full" borderWidth="1.5px" borderColor="fg.subtle" />;
    case 'empty':
      // Hollow like "off", but in full contrast: the source is on, it just found nothing.
      return <Box boxSize={2} borderRadius="full" borderWidth="1.5px" borderColor="fg.muted" />;
    default:
      return <Box boxSize={2} borderRadius="full" bg={status === 'ready' ? 'green.solid' : 'fg.subtle'} />;
  }
}

const SourceChip = observer(function SourceChip({ id }: { id: SourceId }) {
  const { explorerStore } = useStore();
  const s = explorerStore.sources[id];
  const enabled = explorerStore.query.sources[id];
  const taxa = explorerStore.query.taxa;
  // Every selected taxon is GBIF only (no AphiaID), so OBIS cannot contribute a record.
  const noTaxa =
    id === 'obis' && taxa.length > 0 && taxa.every((t) => t.obisId == null || s.gbifOnlyTaxa.includes(t.name));
  const status = chipStatus(enabled, s, noTaxa);
  // "Switched off" is the only hollow, muted chip; an enabled source without records keeps full
  // contrast with a hollow dot and a "no records" suffix, so the two never read alike.
  const statusWord = status === 'empty' && noTaxa ? 'on, but these taxa are not in its checklist' : STATUS_WORD[status];
  const muted = !enabled;
  const seconds = useCountdown(status === 'rateLimited' ? s.retryAt : undefined);
  // The accessible name starts with the chip's visible text (WCAG 2.5.3, label in name).
  const visibleSuffix =
    status === 'empty' ? ' no records' : status === 'rateLimited' && seconds != null ? ` ${seconds} s` : '';
  const label = SOURCES[id].label;
  const locked = explorerStore.isLoading;

  let detail: string;
  if (status === 'off') detail = `${label} is switched off, so it adds no records. Click to include it.`;
  else if (status === 'unsupported') detail = s.supports.ok ? '' : s.supports.reason;
  else if (status === 'error') detail = `${label} preview failed${s.error ? ` (${s.error})` : ''}.`;
  else if (status === 'rateLimited')
    detail = `${label} is busy, retrying${seconds != null ? ` in ${seconds} s` : ''}${
      s.attempt ? ` (attempt ${s.attempt}/5)` : ''
    }.`;
  else if (status === 'loading') detail = `Updating the ${label} preview…`;
  else if (status === 'empty')
    detail = noTaxa
      ? `${label} is on, but has no records for these taxa (they are not in its checklist). Click to switch it off.`
      : `${label} is on, but no records match this query. Click to switch it off.`;
  else detail = `${label} is on. Click to leave it out.`;
  const gbifOnly = id === 'obis' && enabled && s.gbifOnlyTaxa.length > 0;

  return (
    <HStack gap={0}>
      <Tooltip
        showArrow
        openDelay={250}
        content={
          <Stack gap={1} maxW="260px" py={0.5}>
            <Text fontWeight="semibold">{label}</Text>
            <Text>{detail}</Text>
            {gbifOnly && (
              <Text color="fg.muted">
                Not in OBIS: {s.gbifOnlyTaxa.join(', ')}. These taxa come from GBIF only.
              </Text>
            )}
          </Stack>
        }
      >
        <Button
          size="xs"
          variant="outline"
          borderRadius="full"
          px={2.5}
          gap={1.5}
          data-testid={`source-chip-${id}`}
          aria-pressed={enabled}
          aria-label={`${label}${visibleSuffix}: ${statusWord}`}
          disabled={locked}
          onClick={() => explorerStore.setSourceEnabled(id, !enabled)}
          color={muted ? 'fg.muted' : 'fg'}
          borderColor={
            status === 'error'
              ? 'red.muted'
              : status === 'rateLimited'
                ? 'orange.muted'
                : muted
                  ? 'border.muted'
                  : 'border.emphasized'
          }
          borderStyle={muted ? 'dashed' : 'solid'}
          bg={muted ? 'transparent' : 'bg'}
        >
          <Box display="inline-flex" alignItems="center" justifyContent="center" boxSize={3.5}>
            <StatusMark status={status} />
          </Box>
          <Text as="span" fontWeight="semibold">
            {label}
          </Text>
          {enabled && status !== 'error' && status !== 'unsupported' && status !== 'empty' && (
            <Icon as={LuCheck} boxSize={3} color="fg.muted" />
          )}
          {status === 'empty' && (
            <Text as="span" textStyle="2xs" fontWeight="normal" color="fg.muted" aria-hidden>
              {/* Leading space keeps the text content "OBIS no records" (label in name). */}{' '}
              no records
            </Text>
          )}
          {status === 'rateLimited' && seconds != null && (
            <Text as="span" fontVariantNumeric="tabular-nums" color="orange.fg">
              {' '}
              {seconds} s
            </Text>
          )}
        </Button>
      </Tooltip>
      {status === 'error' && (
        <Tooltip content={`Retry the ${label} preview`} openDelay={250}>
          <IconButton
            aria-label={`Retry ${label}`}
            size="xs"
            variant="ghost"
            colorPalette="red"
            ml={0.5}
            onClick={() => explorerStore.retrySource(id)}
          >
            <LuRotateCw />
          </IconButton>
        </Tooltip>
      )}
    </HStack>
  );
});

/** GBIF and OBIS on/off chips with preview status. */
export default observer(function SourceChips() {
  return (
    <HStack gap={1.5} role="group" aria-label="Data sources">
      {IDS.map((id) => (
        <SourceChip key={id} id={id} />
      ))}
    </HStack>
  );
});
