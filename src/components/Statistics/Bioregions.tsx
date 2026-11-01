import {
  Box,
  Button,
  Flex,
  IconButton,
  Input,
  NativeSelect,
  SegmentGroup,
  Text,
  VStack,
} from '@chakra-ui/react';
import { observer } from 'mobx-react';
import {
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { FocusEvent, KeyboardEvent, ReactNode } from 'react';
import { LuSearch, LuX } from 'react-icons/lu';
import { useStore } from '../../store';
import type { Bioregion } from '../../store/InfomapStore';
import type {
  BioregionDensity,
  BioregionSort,
} from '../../store/SettingsStore';
import { InputGroup } from '../ui/input-group';
import { BioregionCard, frameIfMapVisible } from './BioregionCard';
import { BioregionRow } from './BioregionRow';
import { formatInt, plural } from './format';

// Detailed cards by default up to this many bioregions, compact rows above it.
const AUTO_DETAILED_MAX = 12;
// Species names a search may match before we stop collecting them.
const MAX_MATCHES = 50;
// Items mounted in the first render; the rest are added in chunks over the next frames so a deep
// hierarchical level (hundreds of bioregions) never blocks the main thread for long.
const INITIAL = { detailed: 3, compact: 30 } as const;
const CHUNK = { detailed: 3, compact: 40 } as const;

const SORT_OPTIONS: { value: BioregionSort; label: string }[] = [
  { value: 'flow', label: 'Flow' },
  { value: 'records', label: 'Records' },
  { value: 'species', label: 'Species' },
  { value: 'cells', label: 'Cells' },
  { value: 'area', label: 'Area' },
  { value: 'onlyHere', label: 'Found only here' },
];

const SORT_KEY: Record<BioregionSort, (b: Bioregion) => number> = {
  flow: (b) => b.flow,
  records: (b) => b.numRecords,
  species: (b) => b.numSpecies,
  cells: (b) => b.numGridCells,
  area: (b) => b.area,
  onlyHere: (b) => b.numFoundOnlyHere,
};

const DENSITY_ITEMS: { value: BioregionDensity; label: string }[] = [
  { value: 'detailed', label: 'Detailed' },
  { value: 'compact', label: 'Compact' },
];

type SpeciesSearch = {
  query: string;
  names: ReadonlySet<string>;
  first: string | undefined;
  total: number;
  ids: ReadonlySet<number>;
};

const EMPTY_IDS: ReadonlySet<number> = new Set();

export default observer(function Bioregions() {
  const { infomapStore } = useStore();

  if (infomapStore.numBioregions === 0) {
    return null;
  }

  return <BioregionList bioregions={infomapStore.bioregions} />;
});

const BioregionList = observer(function BioregionList({
  bioregions,
}: {
  bioregions: Bioregion[];
}) {
  const store = useStore();
  const { settingsStore, speciesStore, selectionStore } = store;
  const { speciesMap } = speciesStore;
  const listRef = useRef<HTMLDivElement>(null);

  // Species search ----------------------------------------------------------------------------
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const lowerNames = useMemo(
    () =>
      Array.from(
        speciesMap.keys(),
        (name) => [name.toLowerCase(), name] as const,
      ),
    [speciesMap],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: `bioregions` changes whenever countPerRegion is recomputed
  const search = useMemo((): SpeciesSearch | null => {
    if (!deferredQuery) return null;
    const names = new Set<string>();
    let total = 0;
    for (const [lower, name] of lowerNames) {
      if (!lower.includes(deferredQuery)) continue;
      ++total;
      if (names.size < MAX_MATCHES) names.add(name);
    }
    const ids = new Set<number>();
    for (const name of names) {
      for (const [id, count] of speciesMap.get(name)?.countPerRegion ?? []) {
        if (count > 0) ids.add(id);
      }
    }
    const [first] = names;
    return { query: deferredQuery, names, first, total, ids };
  }, [deferredQuery, lowerNames, speciesMap, bioregions]);

  useEffect(() => {
    selectionStore.setSearchIds(search && search.total > 0 ? search.ids : null);
  }, [selectionStore, search]);
  useEffect(() => () => selectionStore.setSearchIds(null), [selectionStore]);

  // Sort, filter, density -----------------------------------------------------------------------
  const sort = settingsStore.bioregionSort;
  const sorted = useMemo(() => {
    const key = SORT_KEY[sort];
    return [...bioregions].sort(
      (a, b) => key(b) - key(a) || a.bioregionId - b.bioregionId,
    );
  }, [bioregions, sort]);

  const visible = useMemo(
    () =>
      search && search.total > 0
        ? sorted.filter((b) => search.ids.has(b.bioregionId))
        : sorted,
    [sorted, search],
  );

  const maxFlow = useMemo(
    () => bioregions.reduce((max, b) => Math.max(max, b.flow), 0),
    [bioregions],
  );

  const density: BioregionDensity =
    settingsStore.bioregionDensity ??
    (bioregions.length <= AUTO_DETAILED_MAX ? 'detailed' : 'compact');

  // Compact rows expanded into cards (several at once, to compare); reset with every new set of
  // bioregions. Expanding selects the bioregion; collapsing leaves the selection alone.
  const [expanded, setExpanded] = useState({
    of: bioregions,
    ids: EMPTY_IDS,
  });
  const expandedIds = expanded.of === bioregions ? expanded.ids : EMPTY_IDS;
  const pendingFocus = useRef<string | null>(null);

  const setExpandedId = (bioregion: Bioregion, open: boolean) => {
    const { bioregionId: id } = bioregion;
    const ids = new Set(expandedIds);
    if (open) ids.add(id);
    else ids.delete(id);
    setExpanded({ of: bioregions, ids });
    pendingFocus.current = open
      ? `[data-testid=bioregion-card][data-bioregion-id="${id}"] [data-roving]`
      : `[data-testid=bioregion-row][data-bioregion-id="${id}"]`;
    if (open && selectionStore.selectedId !== id) {
      selectionStore.select(id);
      frameIfMapVisible(store, bioregion);
    }
  };

  // Keep keyboard focus on the item that replaced the one just expanded or collapsed.
  useLayoutEffect(() => {
    if (!pendingFocus.current) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      pendingFocus.current,
    );
    pendingFocus.current = null;
    if (el) {
      setRovingStop(listRef.current, el);
      el.focus({ preventScroll: true });
    }
  });

  // Progressive mounting ------------------------------------------------------------------------
  const [limit, setLimit] = useState({ of: bioregions, n: 0 });
  const numMounted = Math.max(
    INITIAL[density],
    limit.of === bioregions ? limit.n : 0,
  );
  useEffect(() => {
    if (numMounted >= visible.length) return;
    const timer = window.setTimeout(
      () => setLimit({ of: bioregions, n: numMounted + CHUNK[density] }),
      16,
    );
    return () => window.clearTimeout(timer);
  }, [numMounted, visible.length, bioregions, density]);

  // Roving focus: ArrowUp/ArrowDown move between card headers and compact rows ----------------
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const target = event.target as HTMLElement;
    if (!target.hasAttribute('data-roving')) return;
    const items = rovingItems(listRef.current);
    const next =
      items[items.indexOf(target) + (event.key === 'ArrowDown' ? 1 : -1)];
    if (!next) return;
    event.preventDefault();
    setRovingStop(listRef.current, next);
    next.focus();
  };
  const onFocus = (event: FocusEvent<HTMLDivElement>) => {
    if (event.target.hasAttribute('data-roving')) {
      setRovingStop(listRef.current, event.target);
    }
  };

  const shown = visible.slice(0, numMounted);

  return (
    <VStack
      data-testid="bioregion-list"
      id="bioregions"
      w="100%"
      gap="3"
      align="stretch"
      // The toolbar hides its bioregion count when narrow (the section heading states it).
      css={{ containerType: 'inline-size' }}
    >
      {/* Sticky so search, sort and density stay at hand while scrolling the long list. */}
      <Flex
        wrap="wrap"
        gap="2"
        align="center"
        position="sticky"
        top="0"
        zIndex={3}
        bg="bg"
        py="2"
        borderBottomWidth="1px"
        borderColor="border.muted"
      >
        <InputGroup
          flex="1 1 160px"
          minW="140px"
          maxW="20rem"
          startElement={<LuSearch />}
          endElement={
            query ? (
              <IconButton
                aria-label="Clear species search"
                variant="ghost"
                size="2xs"
                me="-1"
                onClick={() => setQuery('')}
              >
                <LuX />
              </IconButton>
            ) : undefined
          }
        >
          <Input
            size="sm"
            placeholder="Find species…"
            aria-label="Find bioregions by species"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && query) {
                e.stopPropagation();
                setQuery('');
              }
            }}
          />
        </InputGroup>
        {/* A visible label so the sort is not mistaken for a ranking of species. */}
        <Flex align="center" gap="1.5" flexShrink={0}>
          <Text asChild fontSize="xs" color="fg.muted" whiteSpace="nowrap">
            <label htmlFor="bioregion-sort">Sort bioregions by</label>
          </Text>
          <NativeSelect.Root size="sm" w="auto">
            <NativeSelect.Field
              id="bioregion-sort"
              value={sort}
              onChange={(e) =>
                settingsStore.setBioregionSort(
                  e.currentTarget.value as BioregionSort,
                )
              }
            >
              {SORT_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
        </Flex>
        <SegmentGroup.Root
          size="sm"
          flexShrink={0}
          aria-label="List density"
          value={density}
          onValueChange={(e) =>
            settingsStore.setBioregionDensity(e.value as BioregionDensity)
          }
        >
          <SegmentGroup.Indicator />
          <SegmentGroup.Items items={DENSITY_ITEMS} />
        </SegmentGroup.Root>
        <Text
          ms="auto"
          fontSize="sm"
          color="fg.muted"
          fontVariantNumeric="tabular-nums"
          aria-live="polite"
          css={{ '@container (max-width: 999px)': { display: 'none' } }}
        >
          {visible.length === bioregions.length
            ? plural(bioregions.length, 'bioregion')
            : `${formatInt(visible.length)} of ${plural(bioregions.length, 'bioregion')}`}
        </Text>
      </Flex>

      {search && (
        <SearchStatus
          search={search}
          numShown={visible.length}
          onClear={() => setQuery('')}
        />
      )}

      <VStack
        ref={listRef}
        gap={density === 'compact' ? '1.5' : '3'}
        align="stretch"
        onKeyDown={onKeyDown}
        onFocus={onFocus}
      >
        {shown.map((bioregion, i) =>
          density === 'detailed' || expandedIds.has(bioregion.bioregionId) ? (
            <BioregionCard
              key={bioregion.bioregionId}
              bioregion={bioregion}
              highlight={search?.names ?? null}
              tabIndex={i === 0 ? 0 : -1}
              onCollapse={
                density === 'compact'
                  ? () => setExpandedId(bioregion, false)
                  : undefined
              }
            />
          ) : (
            <BioregionRow
              key={bioregion.bioregionId}
              bioregion={bioregion}
              maxFlow={maxFlow}
              tabIndex={i === 0 ? 0 : -1}
              onExpand={() => setExpandedId(bioregion, true)}
            />
          ),
        )}
      </VStack>
    </VStack>
  );
});

function rovingItems(list: HTMLElement | null): HTMLElement[] {
  return list
    ? Array.from(list.querySelectorAll<HTMLElement>('[data-roving]'))
    : [];
}

/** Make `el` the list's single tab stop. */
function setRovingStop(list: HTMLElement | null, el: HTMLElement) {
  for (const item of rovingItems(list)) item.tabIndex = item === el ? 0 : -1;
}

function SearchStatus({
  search,
  numShown,
  onClear,
}: {
  search: SpeciesSearch;
  numShown: number;
  onClear: () => void;
}) {
  const regions = plural(numShown, 'bioregion');
  let message: ReactNode;
  if (search.total === 0) {
    message = <>No species match “{search.query}”</>;
  } else if (search.total === 1) {
    message = (
      <>
        Showing {regions} where <em>{search.first}</em> occurs
      </>
    );
  } else {
    message = (
      <>
        {formatInt(search.total)} species match “{search.query}”
        {search.total > MAX_MATCHES && ` (first ${MAX_MATCHES} used)`} · showing{' '}
        {regions}
      </>
    );
  }
  return (
    <Flex
      align="center"
      gap="2"
      fontSize="sm"
      color="fg.muted"
      role="status"
      minH="7"
    >
      <Box>{message}</Box>
      <Button variant="ghost" size="2xs" onClick={onClear}>
        <LuX /> Clear
      </Button>
    </Flex>
  );
}
