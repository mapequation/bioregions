import { Badge, Box, Button, HStack, Icon, IconButton, Skeleton, Stack, Text } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import type { ReactNode } from 'react';
import { LuCheck, LuCircleDashed, LuInfo, LuTriangleAlert } from 'react-icons/lu';
import { useStore } from '../../../store';
import type { BiasFlag, BiasId } from '../../../store/explorer/types';
import { ToggleTip } from '../../ui/toggle-tip';
import { Tooltip } from '../../ui/tooltip';
import { chartPalettes } from '../charts/colors';
import ShareBar from '../charts/ShareBar';
import { fmtPct } from '../format';

export const BIAS_TITLES: Record<BiasId, string> = {
  datasetDominance: 'Dataset dominance',
  humanObservation: 'Human observations',
  temporalSkew: 'Temporal skew',
  countryConcentration: 'Country concentration',
  lowCountSpecies: 'Low-count species',
};

/** What the value measures, for the bar's accessible label and the passed line. */
const MEASURE: Record<BiasId, string> = {
  datasetDominance: 'of records from the largest dataset',
  humanObservation: 'of records are human observations',
  temporalSkew: 'of dated records from the last 15 years',
  countryConcentration: 'of records from the top country',
  lowCountSpecies: 'of species have fewer than 5 records',
};

/** The threshold as worded by the store (`thresholdLabel`), else the plain percentage. */
function thresholdText(flag: BiasFlag): string {
  return flag.thresholdLabel || fmtPct(flag.threshold);
}

const BAR_HEIGHT = 6;

/** The dotted threshold tick as drawn by ShareBar, for the legend. */
function ThresholdGlyph() {
  return (
    <Box
      as="span"
      display="inline-block"
      verticalAlign="middle"
      h={`${BAR_HEIGHT + 6}px`}
      borderLeftWidth="2px"
      borderLeftStyle="dotted"
      borderColor="fg"
      opacity={0.7}
      ml={0.5}
      mr={1.5}
      aria-hidden
    />
  );
}

function why(flag: BiasFlag): string {
  const t = fmtPct(flag.threshold);
  switch (flag.id) {
    case 'datasetDominance':
      return `Flags when one dataset holds more than ${t} of the records. A single survey or platform then sets where records are, not where species live.`;
    case 'humanObservation':
      return `Flags when more than ${t} of records are human observations. Citizen-science records cluster near cities, roads and popular sites.`;
    case 'temporalSkew':
      return `Flags when more than ${t} of dated records are from the last 15 years. Older ranges, before land-use change, may be missing.`;
    case 'countryConcentration':
      return `Flags when more than ${t} of records come from one country (skipped when the area is a single country). Recording effort differs between countries and can draw borders as region edges.`;
    case 'lowCountSpecies':
      return `Flags when more than ${t} of species have fewer than 5 records. Rare-in-the-data species can form small spurious regions.`;
  }
}

export const sectionHeading = {
  textStyle: 'xs',
  fontWeight: 'semibold',
  letterSpacing: 'wider',
  textTransform: 'uppercase',
  color: 'fg.muted',
} as const;

function WhyTip({ flag }: { flag: BiasFlag }) {
  return (
    <ToggleTip content={<Box maxW="240px">{why(flag)}</Box>} positioning={{ placement: 'left-start' }}>
      <IconButton size="2xs" variant="ghost" color="fg.muted" aria-label={`About the ${BIAS_TITLES[flag.id]} check`}>
        <LuInfo />
      </IconButton>
    </ToggleTip>
  );
}

function TriggeredFlag({ flag }: { flag: BiasFlag }) {
  const title = BIAS_TITLES[flag.id];
  const threshold = thresholdText(flag);
  const tick = Math.min(1, Math.max(0, flag.threshold));
  return (
    <Box
      data-testid="bias-flag"
      data-bias={flag.id}
      role="group"
      aria-label={`${title}: warning`}
      bg="bg"
      borderWidth="1px"
      borderColor="border"
      rounded="lg"
      px={3}
      py={2.5}
    >
      <HStack gap={1.5} align="center">
        <Icon as={LuTriangleAlert} boxSize={4} color="orange.fg" aria-hidden />
        <Text textStyle="sm" fontWeight="semibold" flex="1" minW={0} truncate>
          {title}
        </Text>
        <Text textStyle="sm" fontWeight="semibold" fontVariantNumeric="tabular-nums">
          {fmtPct(flag.value)}
        </Text>
      </HStack>
      <Box position="relative" mt={2} mb={2}>
        <ShareBar
          variant="solid"
          colorPalette={chartPalettes.removal}
          value={flag.value}
          max={1}
          ghostValue={flag.threshold}
          height={BAR_HEIGHT}
          track
          label={`${fmtPct(flag.value)} ${MEASURE[flag.id]}; warning threshold ${threshold}`}
        />
        {/* Hover target over ShareBar's dotted tick: names the threshold. */}
        <Tooltip content={`Warning threshold: ${threshold}`} openDelay={150} showArrow>
          <Box
            as="span"
            aria-hidden
            position="absolute"
            top="-5px"
            bottom="-5px"
            left={`calc(${tick * 100}% - 6px)`}
            w="12px"
            cursor="help"
          />
        </Tooltip>
      </Box>
      <Text textStyle="xs" color="fg.muted" lineHeight="short">
        {flag.text}
      </Text>
      <HStack mt={2} gap={2} justify="space-between">
        {flag.action ? (
          <Button
            size="xs"
            variant="outline"
            minW={0}
            flexShrink={1}
            title={flag.action.label}
            onClick={() => flag.action?.run()}
          >
            <Text as="span" truncate>
              {flag.action.label}
            </Text>
          </Button>
        ) : (
          <Text textStyle="xs" color="fg.muted">
            OBIS datasets can't be excluded.
          </Text>
        )}
        <WhyTip flag={flag} />
      </HStack>
    </Box>
  );
}

function QuietFlag({ flag, pending }: { flag: BiasFlag; pending: boolean }) {
  const title = BIAS_TITLES[flag.id];
  return (
    <HStack gap={2} minH={7} data-bias={flag.id}>
      <Icon
        as={pending ? LuCircleDashed : LuCheck}
        boxSize={3.5}
        color={pending ? 'fg.muted' : 'green.fg'}
        aria-hidden
      />
      <Text textStyle="sm" color="fg.muted" flex="1" minW={0} truncate>
        {title}
        <Box as="span" srOnly>
          {pending ? ': not checked yet. ' : `: passes, ${fmtPct(flag.value)} ${MEASURE[flag.id]}. `}
        </Box>
      </Text>
      <Text textStyle="xs" color="fg.muted" fontVariantNumeric="tabular-nums" aria-hidden>
        {pending ? 'pending' : fmtPct(flag.value)}
      </Text>
      <WhyTip flag={flag} />
    </HStack>
  );
}

/** The five sampling-bias checks: triggered flags as cards, passed checks as one line each. */
export default observer(function BiasPanel() {
  const { explorerStore: ex } = useStore();
  const state = ex.previewState;
  const flags = ex.biasFlags;
  const pending = (f: BiasFlag) => f.id === 'lowCountSpecies' && ex.speciesCounts == null;
  const triggered = flags.filter((f) => f.triggered);
  const quiet = flags.filter((f) => !f.triggered);
  const stale = state === 'stale';

  let summary = null;
  if (flags.length > 0) {
    summary =
      triggered.length > 0 ? (
        <Badge size="sm" colorPalette="orange" variant="subtle" fontVariantNumeric="tabular-nums">
          <LuTriangleAlert aria-hidden />
          {triggered.length} of {flags.length}
        </Badge>
      ) : (
        <Badge size="sm" colorPalette="green" variant="subtle">
          <LuCheck aria-hidden />
          all pass
        </Badge>
      );
  }

  let body: ReactNode;
  if (state === 'first') {
    body = (
      <Stack gap={2} aria-hidden>
        <Skeleton h="96px" rounded="md" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} h="16px" w={`${80 - i * 12}%`} />
        ))}
      </Stack>
    );
  } else if (flags.length === 0) {
    body = (
      <Text textStyle="sm" color="fg.muted">
        {state === 'error' ? 'Checks need a preview. Retry the source from its chip.' : 'No records to check.'}
      </Text>
    );
  } else {
    body = (
      <Stack gap={2}>
        {triggered.map((f) => (
          <TriggeredFlag key={f.id} flag={f} />
        ))}
        {quiet.length > 0 && (
          <Box mt={triggered.length > 0 ? 1 : 0}>
            {quiet.map((f) => (
              <QuietFlag key={f.id} flag={f} pending={pending(f)} />
            ))}
          </Box>
        )}
      </Stack>
    );
  }

  return (
    <Box as="section" aria-labelledby="bias-checks-heading">
      <HStack justify="space-between" mb={2} minH={6}>
        <Text as="h3" id="bias-checks-heading" {...sectionHeading}>
          Bias checks
          {flags.length > 0 && (
            <Box as="span" srOnly>
              , {triggered.length} of {flags.length} flagged
            </Box>
          )}
        </Text>
        <Box aria-hidden>{summary}</Box>
      </HStack>
      {triggered.length > 0 && state !== 'first' && (
        <Text textStyle="xs" color="fg.muted" mt={-1} mb={2} aria-hidden>
          <ThresholdGlyph />
          marks the warning threshold
        </Text>
      )}
      <Box aria-busy={stale || undefined} opacity={stale ? 0.5 : 1} transition="opacity 0.15s">
        {body}
      </Box>
    </Box>
  );
});
