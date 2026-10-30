import { Badge, Box, Button, HStack, Icon, IconButton, Skeleton, Stack, Text, VisuallyHidden } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import type { ReactNode } from 'react';
import { LuCheck, LuCircleDashed, LuInfo, LuTriangleAlert } from 'react-icons/lu';
import { useStore } from '../../../store';
import { BIAS_WARNING_FACTOR } from '../../../store/ExplorerStore';
import type { BiasFlag, BiasId } from '../../../store/explorer/types';
import { ToggleTip } from '../../ui/toggle-tip';
import { Tooltip } from '../../ui/tooltip';
import { chartPalettes } from '../charts/colors';
import ShareBar from '../charts/ShareBar';
import { fmtInt, fmtPct } from '../format';
import { INSIGHTS_POSITIONING, INSIGHTS_TIP_PROPS, insightsScope, ScopeLine } from './ScopeLine';

export const BIAS_TITLES: Record<BiasId, string> = {
  datasetDominance: 'Dataset dominance',
  humanObservation: 'Human observations',
  temporalSkew: 'Temporal skew',
  countryConcentration: 'Country concentration',
  lowCountSpecies: 'Low-count species',
};

/** What the value measures, for the bar's accessible label. */
const MEASURE: Record<BiasId, string> = {
  datasetDominance: 'of records from the largest dataset',
  humanObservation: 'of records are human observations',
  temporalSkew: 'of dated records from the last 15 years',
  countryConcentration: 'of records from the top country',
  lowCountSpecies: 'of species have fewer than 5 records',
};

/** Short definition of the value, for the passed-check line ("species with < 5 records: 10 %"). */
const DEFINITION: Record<BiasId, string> = {
  datasetDominance: 'largest dataset',
  humanObservation: 'human observations',
  temporalSkew: 'dated records from the last 15 years',
  countryConcentration: 'top country',
  lowCountSpecies: 'species with < 5 records',
};

/** "flagged above 20 %": where a note starts. */
const flaggedAbove = (flag: BiasFlag) => `flagged above ${fmtPct(flag.threshold)}`;
/** Where a note becomes a warning. */
const warningFrom = (flag: BiasFlag) => fmtPct(flag.threshold * BIAS_WARNING_FACTOR);

const BAR_HEIGHT = 6;

function why(flag: BiasFlag): string {
  return `${whyCheck(flag)} From ${warningFrom(flag)} it is a warning, below that a note. On the bar, the dotted line marks the ${fmtPct(flag.threshold)} threshold.`;
}

function whyCheck(flag: BiasFlag): string {
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
    <ToggleTip
      content={
        <Box maxW="240px" whiteSpace="normal" lineHeight="short">
          {why(flag)}
        </Box>
      }
      positioning={{ ...INSIGHTS_POSITIONING, placement: 'left-start' }}
    >
      <IconButton size="2xs" variant="ghost" color="fg.muted" aria-label={`About the ${BIAS_TITLES[flag.id]} check`}>
        <LuInfo />
      </IconButton>
    </ToggleTip>
  );
}

/**
 * The action title minus what the visible label already says, for the button's hidden name
 * ("Exclude this dataset" + "Exclude iNaturalist …" -> "iNaturalist …").
 */
function hiddenDetail(label: string, title: string | undefined): string | null {
  if (!title || title === label) return null;
  const verb = label.split(' ')[0];
  return title.startsWith(`${verb} `) ? title.slice(verb.length + 1) : title;
}

/**
 * The remedy as one full-width button: label left, the records it removes right. The accessible
 * name starts with the visible text ("Exclude this dataset: iNaturalist …, −10,543 records") so
 * voice control can target it by what it shows; the full name sits in hidden spans and the tooltip.
 */
function ActionRow({ flag }: { flag: BiasFlag }) {
  const action = flag.action;
  if (!action) {
    return flag.id === 'datasetDominance' ? (
      <Text mt={2} textStyle="xs" color="fg.muted">
        OBIS datasets can't be excluded.
      </Text>
    ) : null;
  }
  const name = action.title ?? action.label;
  const cost = action.cost != null && action.cost > 0 ? action.cost : null;
  const described = cost != null ? `${name} (removes ${fmtInt(cost)} records)` : name;
  const detail = hiddenDetail(action.label, action.title);
  return (
    <Tooltip content={described} openDelay={400} positioning={INSIGHTS_POSITIONING} contentProps={INSIGHTS_TIP_PROPS}>
      <Button
        mt={2}
        size="xs"
        variant="outline"
        w="full"
        justifyContent="space-between"
        gap={2}
        onClick={() => action.run()}
      >
        <Text as="span" truncate>
          {action.label}
          {detail && <VisuallyHidden>: {detail}</VisuallyHidden>}
        </Text>
        {cost != null && (
          <Text as="span" color="fg.muted" fontWeight="normal" fontVariantNumeric="tabular-nums" flexShrink={0}>
            <VisuallyHidden>, </VisuallyHidden>
            {`\u2212${fmtInt(cost)}`}
            <VisuallyHidden> records</VisuallyHidden>
          </Text>
        )}
      </Button>
    </Tooltip>
  );
}

function TriggeredFlag({ flag }: { flag: BiasFlag }) {
  const title = BIAS_TITLES[flag.id];
  const warning = flag.level === 'warning';
  const levelText = warning ? 'warning' : 'note';
  const thresholds = `${flaggedAbove(flag)}, a warning from ${warningFrom(flag)}`;
  return (
    <Box
      data-testid="bias-flag"
      data-bias={flag.id}
      data-level={levelText}
      role="group"
      aria-label={`${title}: ${levelText}`}
      bg="bg"
      borderWidth="1px"
      borderColor={warning ? 'orange.muted' : 'border'}
      rounded="lg"
      px={3}
      py={2.5}
    >
      <HStack gap={1.5} align="center" minH={6}>
        <Icon
          as={warning ? LuTriangleAlert : LuInfo}
          boxSize={4}
          color={warning ? 'orange.fg' : 'fg.muted'}
          aria-hidden
        />
        <Text
          textStyle="sm"
          fontWeight={warning ? 'semibold' : 'medium'}
          flex="1"
          minW={0}
          lineHeight="short"
          truncate
          title={title}
        >
          {title}
        </Text>
        <WhyTip flag={flag} />
      </HStack>
      {/* Value in a fixed right column beside its bar, so the title keeps one line. */}
      <HStack gap={2} mt={1} mb={2} align="center">
        <Tooltip
          content={`${fmtPct(flag.value)} ${MEASURE[flag.id]}. The dotted line marks the threshold: ${thresholds}.`}
          openDelay={150}
          positioning={INSIGHTS_POSITIONING}
          contentProps={INSIGHTS_TIP_PROPS}
        >
          <Box position="relative" flex="1" minW={0} py="5px" my="-5px" cursor="help">
            <ShareBar
              variant={warning ? 'solid' : 'muted'}
              colorPalette={warning ? chartPalettes.removal : 'gray'}
              value={flag.value}
              max={1}
              ghostValue={flag.threshold}
              height={BAR_HEIGHT}
              track
              label={`${fmtPct(flag.value)} ${MEASURE[flag.id]}; ${thresholds}`}
            />
          </Box>
        </Tooltip>
        <Text
          textStyle="sm"
          fontWeight={warning ? 'semibold' : 'medium'}
          color={warning ? 'fg' : 'fg.muted'}
          fontVariantNumeric="tabular-nums"
          textAlign="end"
          w="5ch"
          flexShrink={0}
          whiteSpace="nowrap"
          lineHeight="short"
        >
          {fmtPct(flag.value)}
        </Text>
      </HStack>
      <Text textStyle="xs" color="fg.muted" lineHeight="short">
        {flag.text}
      </Text>
      <ActionRow flag={flag} />
    </Box>
  );
}

function QuietFlag({ flag, pending }: { flag: BiasFlag; pending: boolean }) {
  const title = BIAS_TITLES[flag.id];
  const detail = pending
    ? `${DEFINITION[flag.id]}: known once the load is planned`
    : `${DEFINITION[flag.id]}: ${fmtPct(flag.value)} \u00b7 ${flaggedAbove(flag)}`;
  return (
    <HStack gap={2} py={1} align="flex-start" data-bias={flag.id}>
      <Icon
        as={pending ? LuCircleDashed : LuCheck}
        boxSize={3.5}
        mt={0.5}
        color={pending ? 'fg.muted' : 'green.fg'}
        aria-hidden
      />
      <Box flex="1" minW={0}>
        <Text textStyle="sm" color="fg.muted" lineHeight="short">
          {title}
          <Box as="span" srOnly>
            {pending ? ': not checked yet.' : ': passes.'}
          </Box>
        </Text>
        <Text textStyle="xs" color="fg.muted" lineHeight="short" fontVariantNumeric="tabular-nums">
          {detail}
        </Text>
      </Box>
      <WhyTip flag={flag} />
    </HStack>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The five sampling-bias checks: warnings (orange) and notes (muted) as cards, passed
 * checks as one line each with their value and threshold.
 */
export default observer(function BiasPanel() {
  const { explorerStore: ex } = useStore();
  const state = ex.previewState;
  const flags = ex.biasFlags;
  const pending = (f: BiasFlag) => f.id === 'lowCountSpecies' && ex.speciesCounts == null;
  const warnings = flags.filter((f) => f.triggered && f.level === 'warning');
  const notes = flags.filter((f) => f.triggered && f.level !== 'warning');
  const quiet = flags.filter((f) => !f.triggered);
  const stale = state === 'stale';
  // Flags and composition share one scope (the query preview, or the loaded or partial dataset).
  const comp = ex.composition;
  const scope = insightsScope(ex);

  const counts = [
    warnings.length > 0 && plural(warnings.length, 'warning'),
    notes.length > 0 && plural(notes.length, 'note'),
  ].filter(Boolean);
  const countText = counts.join(' \u00b7 ');

  let summary = null;
  if (flags.length > 0) {
    summary =
      warnings.length > 0 || notes.length > 0 ? (
        <Badge
          size="sm"
          colorPalette={warnings.length > 0 ? 'orange' : 'gray'}
          variant="subtle"
          fontVariantNumeric="tabular-nums"
          whiteSpace="nowrap"
        >
          {warnings.length > 0 ? <LuTriangleAlert aria-hidden /> : <LuInfo aria-hidden />}
          {countText}
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
    const cards = [...warnings, ...notes];
    body = (
      <Stack gap={2}>
        {cards.map((f) => (
          <TriggeredFlag key={f.id} flag={f} />
        ))}
        {quiet.length > 0 && (
          <Box mt={cards.length > 0 ? 1 : 0}>
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
      <HStack justify="space-between" mb={2} minH={6} gap={2}>
        <Text as="h3" id="bias-checks-heading" {...sectionHeading} whiteSpace="nowrap">
          Bias checks
          {flags.length > 0 && (
            <Box as="span" srOnly>
              , {countText || 'all pass'}
            </Box>
          )}
        </Text>
        <Box aria-hidden>{summary}</Box>
      </HStack>
      <ScopeLine kind={comp.scopeKind} records={comp.total} id="bias-checks-scope" detail={scope?.label} />
      <Box
        aria-busy={stale || undefined}
        aria-describedby="bias-checks-scope"
        opacity={stale ? 0.5 : 1}
        transition="opacity 0.15s"
      >
        {body}
      </Box>
    </Box>
  );
});
