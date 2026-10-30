import { Badge, Box, Button, chakra, HStack, Icon, Skeleton, Stack, Text } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { LuCircleMinus } from 'react-icons/lu';
import { ALL_BASIS, BASIS_LABELS, issueLabel } from '../../../sources';
import type { BasisOfRecord, FacetBucket, SourceId } from '../../../sources/types';
import { useStore } from '../../../store';
import { PopoverArrow, PopoverBody, PopoverContent, PopoverRoot, PopoverTrigger } from '../../ui/popover';
import { Tooltip } from '../../ui/tooltip';
import ShareBar from '../charts/ShareBar';
import { fmtInt, fmtPct } from '../format';
import { sectionHeading } from './BiasPanel';
import { INSIGHTS_POSITIONING, INSIGHTS_TIP_PROPS, insightsScope, ScopeLine } from './ScopeLine';

const COLLAPSED = 5;

interface Item {
  key: string;
  label: string;
  count: number;
  /** Source tag for per-source lists. */
  source?: SourceId;
  italic?: boolean;
}

interface Exclude {
  /** Whether this item can be excluded, else why not (shown as the row's title). */
  can(item: Item): true | string;
  run(item: Item): void;
  /** e.g. "from GBIF results". */
  scope(item: Item): string;
}

interface ShareListProps {
  id: string;
  title: string;
  items: Item[];
  denom: number;
  /** Note beside the title, e.g. "GBIF · can overlap". */
  note?: string;
  /** Tooltip explaining the note. */
  noteTip?: string;
  /** What the counts are (the confirm popover): the query preview or the loaded dataset. */
  loaded?: boolean;
  exclude?: Exclude;
  highlight?: boolean;
  empty: string;
  footer?: ReactNode;
}

/** Muted note beside a list title; with a tip it is focusable and explains itself in a tooltip. */
function Note({ text, tip }: { text: string; tip?: string }) {
  if (!tip) {
    return (
      <Text textStyle="xs" color="fg.muted" whiteSpace="nowrap" flexShrink={0}>
        {text}
      </Text>
    );
  }
  return (
    <Tooltip content={tip} openDelay={300} positioning={INSIGHTS_POSITIONING} contentProps={INSIGHTS_TIP_PROPS}>
      <Text
        as="span"
        tabIndex={0}
        textStyle="xs"
        color="fg.muted"
        whiteSpace="nowrap"
        flexShrink={0}
        cursor="help"
        textDecoration="underline dotted"
        textUnderlineOffset="2px"
        rounded="sm"
        outline="none"
        _focusVisible={{ outline: '2px solid', outlineColor: 'colorPalette.focusRing' }}
      >
        {text}
        <Box as="span" srOnly>
          : {tip}
        </Box>
      </Text>
    </Tooltip>
  );
}

const ShareList = observer(function ShareList({
  id,
  title,
  items,
  denom,
  note,
  noteTip,
  loaded,
  exclude,
  highlight,
  empty,
  footer,
}: ShareListProps) {
  const [expanded, setExpanded] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const shown = expanded ? items : items.slice(0, COLLAPSED);
  const headingId = `composition-${id}`;

  return (
    <Box
      as="section"
      aria-labelledby={headingId}
      data-composition={id}
      rounded="md"
      mx={-2}
      px={2}
      py={1}
      outline={highlight ? '2px solid' : '2px solid transparent'}
      outlineColor={highlight ? 'orange.focusRing' : 'transparent'}
      bg={highlight ? 'orange.subtle/40' : undefined}
      transition="background 0.3s, outline-color 0.3s"
    >
      <HStack gap={2} minH={6} mb={0.5}>
        <Text id={headingId} as="h4" textStyle="sm" fontWeight="semibold" flex="1" minW={0} truncate tabIndex={-1}>
          {title}
          {items.length > 0 && (
            <Text as="span" color="fg.muted" fontWeight="normal" ms={1.5} fontVariantNumeric="tabular-nums">
              {items.length}
            </Text>
          )}
        </Text>
        {note && <Note text={note} tip={noteTip} />}
      </HStack>
      {items.length === 0 ? (
        <Text textStyle="xs" color="fg.muted" pb={1}>
          {empty}
        </Text>
      ) : (
        <Box as="ul" listStyleType="none" m={0} p={0}>
          {shown.map((item) => {
            const share = denom > 0 ? item.count / denom : 0;
            const can = exclude?.can(item);
            const actionable = can === true;
            const open = confirm === item.key;
            const content = (
              <>
                <HStack gap={1.5} w="full" minW={0}>
                  <Text
                    textStyle="xs"
                    color="fg"
                    flex="1"
                    minW={0}
                    truncate
                    fontStyle={item.italic ? 'italic' : undefined}
                    title={item.label}
                  >
                    {item.label}
                  </Text>
                  {item.source && item.source !== 'gbif' && (
                    <Badge size="xs" variant="outline" flexShrink={0}>
                      {item.source.toUpperCase()}
                    </Badge>
                  )}
                  {actionable && (
                    <Icon
                      as={LuCircleMinus}
                      boxSize={3}
                      color="fg.muted"
                      opacity={open ? 1 : 0}
                      className="exclude-hint"
                      aria-hidden
                    />
                  )}
                  <Text textStyle="xs" color="fg.muted" fontVariantNumeric="tabular-nums" flexShrink={0}>
                    {fmtInt(item.count)}
                  </Text>
                  <Text
                    textStyle="xs"
                    color="fg.muted"
                    fontVariantNumeric="tabular-nums"
                    w="4.5ch"
                    textAlign="right"
                    flexShrink={0}
                  >
                    {fmtPct(share)}
                  </Text>
                </HStack>
                <Box w="full" mt={1}>
                  <ShareBar value={item.count} max={denom} height={4} track />
                </Box>
              </>
            );
            return (
              <Box as="li" key={`${item.source ?? ''}:${item.key}`}>
                {actionable && exclude ? (
                  <PopoverRoot
                    open={open}
                    onOpenChange={(e) => setConfirm(e.open ? item.key : null)}
                    positioning={{ ...INSIGHTS_POSITIONING, placement: 'left-start' }}
                    initialFocusEl={() => confirmRef.current}
                    lazyMount
                    unmountOnExit
                  >
                    <PopoverTrigger asChild>
                      <chakra.button
                        type="button"
                        display="block"
                        w="full"
                        textAlign="left"
                        px={1}
                        mx={-1}
                        py={1}
                        rounded="sm"
                        cursor="pointer"
                        bg={open ? 'bg.muted' : undefined}
                        _hover={{ bg: 'bg.muted', '& .exclude-hint': { opacity: 1 } }}
                        _focusVisible={{
                          outline: '2px solid',
                          outlineColor: 'colorPalette.focusRing',
                          '& .exclude-hint': { opacity: 1 },
                        }}
                        // No aria-label: the visible text (label, count, share, "click to exclude")
                        // is the accessible name (WCAG label-in-name).
                      >
                        {content}
                      </chakra.button>
                    </PopoverTrigger>
                    <PopoverContent w="240px" aria-label={`Exclude ${item.label}?`}>
                      <PopoverArrow />
                      <PopoverBody p={3}>
                        <Text textStyle="sm" mb={1}>
                          Exclude <b>{item.label}</b> {exclude.scope(item)}?
                        </Text>
                        <Text textStyle="xs" color="fg.muted" mb={3} fontVariantNumeric="tabular-nums">
                          {loaded ? 'The loaded dataset has ' : 'Removes about '}
                          <Box as="span" whiteSpace="nowrap">
                            {fmtInt(item.count)} such records ({fmtPct(share)})
                          </Box>
                          {loaded ? '; this applies from the next load.' : '.'} Undo it in the decision ledger.
                        </Text>
                        <HStack gap={2} justify="flex-end">
                          <Button size="xs" variant="ghost" onClick={() => setConfirm(null)}>
                            Cancel
                          </Button>
                          <Button
                            ref={confirmRef}
                            size="xs"
                            colorPalette="orange"
                            onClick={() => {
                              setConfirm(null);
                              exclude.run(item);
                            }}
                          >
                            <LuCircleMinus />
                            Exclude
                          </Button>
                        </HStack>
                      </PopoverBody>
                    </PopoverContent>
                  </PopoverRoot>
                ) : (
                  <Box py={1} title={typeof can === 'string' ? can : undefined}>
                    {content}
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      )}
      {items.length > COLLAPSED && (
        <Button
          size="xs"
          variant="plain"
          px={0}
          h={6}
          color="fg.muted"
          _hover={{ color: 'fg', textDecoration: 'underline' }}
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Show fewer' : `Show all ${items.length}`}
        </Button>
      )}
      {footer}
    </Box>
  );
});

const OVERLAP_TIP = 'A record can carry several issues, so the shares can add up to more than 100 %.';

const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10_000 ? 0 : 1)} km` : `${Math.round(m)} m`);

/** One facet's buckets with their denominator, and whether it fell back to the query preview. */
interface Facet<T> {
  items: T;
  denom: number;
  /** The scope is the loaded dataset but this facet is the query's (not available after a load). */
  fromQuery: boolean;
}

const FOR_QUERY = 'for the query';

/** Basis, datasets, species, countries and issues of the insights scope (query or loaded data) as share lists. */
export default observer(function CompositionPanel() {
  const { explorerStore: ex } = useStore();
  const state = ex.previewState;
  const previews = ex.previews;
  const gbif = previews.find((p) => p.source === 'gbif');
  const quality = ex.query.quality;
  const excluded = quality.excludeDatasets ?? [];
  const allowedBasis = quality.basisOfRecord.length > 0 ? quality.basisOfRecord : ALL_BASIS;
  const comp = ex.composition;
  const scopeKind = comp.scopeKind;
  const total = comp.total;
  const onLoaded = scopeKind !== 'query';
  const onlyGbif = previews.length > 0 && previews.every((p) => p.source === 'gbif');

  const [highlight, setHighlight] = useState(false);
  const countriesRef = useRef<HTMLDivElement>(null);
  const focus = ex.insightFocus;
  useEffect(() => {
    if (focus !== 'countries') return;
    const el = countriesRef.current;
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el?.querySelector<HTMLElement>('h4')?.focus({ preventScroll: true });
    setHighlight(true);
    const t = setTimeout(() => {
      setHighlight(false);
      ex.setInsightFocus(null);
    }, 2400);
    return () => clearTimeout(t);
  }, [focus, ex]);

  const inScope = <T,>(items: T): Facet<T> => ({ items, denom: total, fromQuery: false });
  // Dataset buckets carry no source: tag each with the source whose preview lists it (GBIF
  // ones can be excluded, others get a badge). While previewing, keep each source's own list.
  const sourceOf = new Map<string, SourceId>();
  for (const p of previews) for (const d of p.topDatasets) if (!sourceOf.has(d.key)) sourceOf.set(d.key, p.source);
  const datasets: Facet<(FacetBucket & { source?: SourceId })[]> = inScope(
    onLoaded
      ? comp.topDatasets.map((b) => ({ ...b, source: sourceOf.get(b.key) }))
      : previews.flatMap((p) => p.topDatasets.map((b) => ({ ...b, source: p.source }))),
  );
  const basis = inScope(comp.basisOfRecord);
  const species = inScope(comp.topSpecies);
  const countries = inScope(comp.countries);
  // GBIF issues are not streamed with the records: after a load, show the query's, labelled.
  const issuesFromQuery = onLoaded && comp.issues.length === 0 && gbif != null;
  const issues: Facet<FacetBucket[]> = issuesFromQuery
    ? { items: gbif.issues, denom: gbif.total, fromQuery: true }
    : { items: comp.issues, denom: onLoaded ? total : (gbif?.total ?? total), fromQuery: false };
  const unc = comp.uncertainty;

  const basisItems: Item[] = basis.items.map((b) => ({
    key: b.key,
    label: BASIS_LABELS[b.key as BasisOfRecord] ?? b.label,
    count: b.count,
  }));
  const datasetItems: Item[] = datasets.items
    // A loaded dataset missing from the previews' lists is GBIF's when GBIF is the only source.
    .map((b) => ({ ...b, source: b.source ?? (onlyGbif ? ('gbif' as const) : undefined) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  const speciesItems: Item[] = species.items.slice(0, 10).map((b) => ({ ...b, italic: true }));
  const countryItems: Item[] = countries.items.slice(0, 10);
  const issueItems: Item[] = issues.items.slice(0, 8).map((b) => ({ ...b, label: issueLabel(b.key) }));
  const showIssues = gbif != null || comp.issues.length > 0;

  if (state === 'first' && !onLoaded) {
    return (
      <Box as="section" aria-label="Composition" aria-busy>
        <Text as="h3" {...sectionHeading} mb={2}>
          Composition
        </Text>
        <Stack gap={4} aria-hidden>
          {[0, 1, 2].map((i) => (
            <Stack key={i} gap={2}>
              <Skeleton h="14px" w="45%" />
              <Skeleton h="10px" />
              <Skeleton h="10px" w="70%" />
              <Skeleton h="10px" w="40%" />
            </Stack>
          ))}
        </Stack>
      </Box>
    );
  }
  if (total === 0) return null;

  // The loaded dataset's numbers don't change while the query preview refreshes.
  const stale = state === 'stale' && !onLoaded;
  return (
    <Box as="section" aria-labelledby="composition-heading">
      <HStack justify="space-between" mb={1} minH={6}>
        <Text as="h3" id="composition-heading" {...sectionHeading}>
          Composition
        </Text>
      </HStack>
      <ScopeLine kind={scopeKind} records={total} detail={insightsScope(ex)?.label} />
      <Stack gap={3} aria-busy={stale || undefined} opacity={stale ? 0.5 : 1} transition="opacity 0.15s">
        <ShareList
          id="basis"
          title="Basis of record"
          note="click to exclude"
          loaded={onLoaded}
          items={basisItems}
          denom={basis.denom}
          empty="Not reported."
          exclude={{
            can: (it) =>
              allowedBasis.length > 1 && allowedBasis.includes(it.key as BasisOfRecord)
                ? true
                : 'The last allowed basis of record cannot be excluded.',
            run: (it) => ex.excludeBasis(it.key as BasisOfRecord),
            scope: () => 'from all sources',
          }}
        />
        <ShareList
          id="datasets"
          title="Top datasets"
          note={datasetItems.some((d) => d.source === 'gbif') ? 'click GBIF to exclude' : undefined}
          loaded={onLoaded}
          items={datasetItems}
          denom={datasets.denom}
          empty="Not reported."
          exclude={{
            can: (it) => (it.source === 'gbif' ? true : 'Dataset exclusion is available for GBIF datasets only.'),
            run: (it) => ex.excludeDataset(it.key),
            scope: () => 'from GBIF results',
          }}
          footer={
            excluded.length > 0 ? (
              <HStack gap={1} mt={1}>
                <Text textStyle="xs" color="fg.muted" fontVariantNumeric="tabular-nums">
                  {excluded.length} {excluded.length === 1 ? 'dataset' : 'datasets'} excluded
                </Text>
                <Button
                  size="xs"
                  variant="plain"
                  px={1}
                  h={6}
                  color="fg.muted"
                  textDecoration="underline"
                  onClick={() => ex.setQuality({ excludeDatasets: [] })}
                >
                  Include again
                </Button>
              </HStack>
            ) : undefined
          }
        />
        <ShareList
          id="species"
          title="Top species"
          items={speciesItems}
          denom={species.denom}
          empty="Not reported."
        />
        <Box ref={countriesRef} scrollMarginTop={4}>
          <ShareList
            id="countries"
            title="Countries"
            items={countryItems}
            denom={countries.denom}
            highlight={highlight}
            empty="Not reported."
            footer={
              comp.notes?.countries ? (
                <Text textStyle="xs" color="fg.muted" lineHeight="short" mt={1} fontVariantNumeric="tabular-nums">
                  {comp.notes.countries}
                </Text>
              ) : undefined
            }
          />
        </Box>
        {showIssues && (
          <ShareList
            id="issues"
            title="Issues"
            note={issues.fromQuery ? `GBIF · ${FOR_QUERY}` : 'GBIF · can overlap'}
            noteTip={
              issues.fromQuery
                ? `${comp.notes?.issues ?? 'GBIF reports interpretation issues for the query only.'} This shows the query preview. ${OVERLAP_TIP}`
                : OVERLAP_TIP
            }
            items={issueItems}
            denom={issues.denom}
            empty="No interpretation issues reported."
          />
        )}
        <Box borderTopWidth="1px" borderColor="border.muted" pt={2}>
          <Text textStyle="sm" fontWeight="semibold">
            Coordinate uncertainty
          </Text>
          <Text textStyle="xs" color="fg.muted" fontVariantNumeric="tabular-nums" mt={0.5}>
            {unc ? `Average ${km(unc.avg)} · largest ${km(unc.max)}` : 'Not reported by the sources.'}
          </Text>
        </Box>
      </Stack>
    </Box>
  );
});
