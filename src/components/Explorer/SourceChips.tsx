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

type ChipStatus = 'off' | 'unsupported' | 'idle' | 'loading' | 'ready' | 'error' | 'rateLimited';

function chipStatus(enabled: boolean, s: SourceState): ChipStatus {
  if (!enabled) return 'off';
  if (!s.supports.ok) return 'unsupported';
  return s.state;
}

const STATUS_WORD: Record<ChipStatus, string> = {
  off: 'off',
  unsupported: 'not used for this query',
  idle: 'on',
  loading: 'updating',
  ready: 'ready',
  error: 'preview failed',
  rateLimited: 'busy, retrying',
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
    default:
      return <Box boxSize={2} borderRadius="full" bg={status === 'ready' ? 'green.solid' : 'fg.subtle'} />;
  }
}

const SourceChip = observer(function SourceChip({ id }: { id: SourceId }) {
  const { explorerStore } = useStore();
  const s = explorerStore.sources[id];
  const enabled = explorerStore.query.sources[id];
  const status = chipStatus(enabled, s);
  const seconds = useCountdown(status === 'rateLimited' ? s.retryAt : undefined);
  const label = SOURCES[id].label;
  const locked = explorerStore.job?.state === 'planning' || explorerStore.job?.state === 'streaming';

  let detail: string;
  if (status === 'off') detail = `${label} is off. Click to include it.`;
  else if (status === 'unsupported') detail = s.supports.ok ? '' : s.supports.reason;
  else if (status === 'error') detail = `${label} preview failed${s.error ? ` (${s.error})` : ''}.`;
  else if (status === 'rateLimited')
    detail = `${label} is busy, retrying${seconds != null ? ` in ${seconds} s` : ''}${
      s.attempt ? ` (attempt ${s.attempt}/5)` : ''
    }.`;
  else if (status === 'loading') detail = `Updating the ${label} preview…`;
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
          aria-label={`${label}: ${STATUS_WORD[status]}`}
          disabled={locked}
          onClick={() => explorerStore.setSourceEnabled(id, !enabled)}
          color={enabled ? 'fg' : 'fg.muted'}
          borderColor={status === 'error' ? 'red.muted' : status === 'rateLimited' ? 'orange.muted' : 'border'}
          bg={enabled ? 'bg' : 'bg.subtle'}
          borderStyle={enabled ? 'solid' : 'dashed'}
        >
          <Box display="inline-flex" alignItems="center" justifyContent="center" boxSize={3.5}>
            <StatusMark status={status} />
          </Box>
          <Text as="span" fontWeight="semibold" textDecoration={enabled ? undefined : 'line-through'}>
            {label}
          </Text>
          {enabled && status !== 'error' && status !== 'unsupported' && (
            <Icon as={LuCheck} boxSize={3} color="fg.muted" />
          )}
          {status === 'rateLimited' && seconds != null && (
            <Text as="span" fontVariantNumeric="tabular-nums" color="orange.fg">
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
