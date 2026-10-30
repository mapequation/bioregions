import {
  Badge,
  Box,
  Combobox,
  createListCollection,
  HStack,
  Icon,
  Portal,
  Spinner,
  Stack,
  Tag,
  Text,
  Wrap,
} from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { type ReactNode, useEffect, useState } from 'react';
import { LuCheck, LuMinus, LuSearch, LuTriangleAlert } from 'react-icons/lu';
import { isAbortError } from '@/sources';
import type { TaxonRef } from '@/sources/types';
import { useStore } from '../../../store';
import type { TaxonSuggestion } from '../../../store/explorer/types';
import { fmtCompact } from '../format';

const MIN_CHARS = 2;
const DEBOUNCE_MS = 250;

type SearchState = 'idle' | 'loading' | 'ready' | 'error';

const ITALIC_RANKS = new Set(['GENUS', 'SUBGENUS', 'SPECIES', 'SUBSPECIES', 'VARIETY', 'FORM']);

function toRef(t: TaxonSuggestion): TaxonRef {
  const ref: TaxonRef = { name: t.name, rank: t.rank };
  if (t.gbifKey != null) ref.gbifKey = t.gbifKey;
  if (t.obisId != null) ref.obisId = t.obisId;
  if (t.vernacularName) ref.vernacularName = t.vernacularName;
  if (t.path) ref.path = t.path;
  return ref;
}

function rankLabel(rank: string): string {
  return rank ? rank.charAt(0) + rank.slice(1).toLowerCase() : 'Taxon';
}

function SourceBadge({ label, on }: { label: string; on: boolean }) {
  return (
    <Badge
      size="xs"
      variant={on ? 'subtle' : 'outline'}
      color={on ? 'fg' : 'fg.muted'}
      gap={0.5}
      fontVariantNumeric="tabular-nums"
      aria-label={`${on ? 'In' : 'Not in'} ${label}`}
    >
      {label}
      <Icon as={on ? LuCheck : LuMinus} boxSize={2.5} />
    </Badge>
  );
}

function SuggestionRow({ t }: { t: TaxonSuggestion }) {
  return (
    <HStack w="full" gap={3} align="flex-start" py={0.5}>
      <Stack gap={0} flex="1" minW={0}>
        <HStack gap={1.5} minW={0}>
          <Text fontWeight="semibold" truncate fontStyle={ITALIC_RANKS.has(t.rank) ? 'italic' : undefined}>
            {t.name}
          </Text>
          <Badge size="xs" variant="surface" flexShrink={0} textTransform="uppercase" letterSpacing="wide">
            {rankLabel(t.rank)}
          </Badge>
        </HStack>
        {t.vernacularName && (
          <Text fontSize="xs" color="fg.muted" truncate>
            {t.vernacularName}
          </Text>
        )}
        {t.path && (
          <Text fontSize="xs" color="fg.muted" truncate title={t.path}>
            {t.path}
          </Text>
        )}
      </Stack>
      <Stack gap={1} align="flex-end" flexShrink={0}>
        <Text fontSize="xs" color="fg.muted" fontVariantNumeric="tabular-nums" minH={4}>
          {t.gbifCount != null ? `${fmtCompact(t.gbifCount)} rec.` : ''}
        </Text>
        <HStack gap={1}>
          <SourceBadge label="GBIF" on={t.inGbif} />
          <SourceBadge label="OBIS" on={t.inObis} />
        </HStack>
      </Stack>
    </HStack>
  );
}

const TaxonChips = observer(function TaxonChips() {
  const { explorerStore } = useStore();
  const q = explorerStore.query;
  const both = q.sources.gbif && q.sources.obis;
  const notInObis = new Set(explorerStore.sources.obis.gbifOnlyTaxa);
  if (q.taxa.length === 0) {
    return (
      <Text fontSize="xs" color="fg.muted" mt={2}>
        For example Felidae or Trochilidae. Records of any taxon you add are included.
      </Text>
    );
  }
  return (
    <Wrap gap={1.5} mt={2.5} as="ul" aria-label="Selected taxa" listStyleType="none">
      {q.taxa.map((t) => {
        let note: string | null = null;
        if (both && (t.obisId == null || notInObis.has(t.name))) note = 'GBIF only';
        else if (both && t.gbifKey == null) note = 'OBIS only';
        return (
          <Box as="li" key={t.name} maxW="full">
            <Tag.Root
              size="lg"
              variant="surface"
              data-testid="taxon-chip"
              maxW="full"
              borderRadius="md"
              title={[t.name, t.vernacularName, t.path].filter(Boolean).join(' · ')}
            >
              <Tag.Label display="inline-flex" alignItems="baseline" gap={1.5} minW={0}>
                <Text as="span" fontWeight="semibold" truncate fontStyle={ITALIC_RANKS.has(t.rank) ? 'italic' : undefined}>
                  {t.name}
                </Text>
                <Text as="span" fontSize="2xs" color="fg.muted" textTransform="uppercase" letterSpacing="wide">
                  {rankLabel(t.rank)}
                </Text>
                {note && (
                  <Text as="span" fontSize="2xs" color="orange.fg" fontWeight="medium" whiteSpace="nowrap">
                    {note}
                  </Text>
                )}
              </Tag.Label>
              <Tag.EndElement>
                <Tag.CloseTrigger aria-label={`Remove ${t.name}`} onClick={() => explorerStore.removeTaxon(t.name)} />
              </Tag.EndElement>
            </Tag.Root>
          </Box>
        );
      })}
    </Wrap>
  );
});

/** Taxon search (GBIF + OBIS suggestions) with the selected taxa as chips. */
export default observer(function TaxonPicker() {
  const { explorerStore } = useStore();
  const [input, setInput] = useState('');
  const [items, setItems] = useState<TaxonSuggestion[]>([]);
  const [state, setState] = useState<SearchState>('idle');

  useEffect(() => {
    const q = input.trim();
    if (q.length < MIN_CHARS) {
      setItems([]);
      setState('idle');
      return;
    }
    setState('loading');
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const found = await explorerStore.suggestTaxa(q, ctrl.signal);
        if (ctrl.signal.aborted) return;
        setItems(found);
        setState('ready');
      } catch (e) {
        if (ctrl.signal.aborted || isAbortError(e)) return;
        setItems([]);
        setState('error');
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [input, explorerStore]);

  const selected = new Set(explorerStore.query.taxa.map((t) => t.name.toLowerCase()));
  const visible = items.filter((t) => !selected.has(t.name.toLowerCase()));
  const collection = createListCollection({
    items: visible,
    itemToValue: (t) => t.name,
    itemToString: (t) => t.name,
  });

  const term = input.trim();
  let emptyText: ReactNode = null;
  if (term.length < MIN_CHARS) emptyText = 'Type at least two letters.';
  else if (state === 'loading') emptyText = (
    <HStack gap={2}>
      <Spinner size="xs" />
      <span>Searching GBIF and OBIS…</span>
    </HStack>
  );
  else if (state === 'error') emptyText = (
    <HStack gap={2} color="red.fg">
      <Icon as={LuTriangleAlert} />
      <span>Taxon search failed. Check your connection and type again.</span>
    </HStack>
  );
  else emptyText = `No taxa match “${term}”. Try a scientific name.`;

  return (
    <Box>
      <Combobox.Root
        // Mount the portalled content on open: the explorer dialog aria-hides body children present when it opens.
        lazyMount
        unmountOnExit
        collection={collection}
        size="sm"
        inputValue={input}
        onInputValueChange={(e) => setInput(e.inputValue)}
        value={[]}
        onValueChange={(e) => {
          const t = items.find((x) => x.name === e.value[0]);
          if (t) explorerStore.addTaxon(toRef(t));
          setInput('');
        }}
        inputBehavior="autohighlight"
        selectionBehavior="clear"
        openOnClick={false}
        positioning={{ placement: 'bottom-start', sameWidth: false, gutter: 4 }}
      >
        <Combobox.Label srOnly>Search taxa</Combobox.Label>
        <Combobox.Control>
          <Box position="absolute" insetStart={2.5} top="50%" transform="translateY(-50%)" color="fg.muted" pointerEvents="none" display="flex" zIndex={1}>
            <Icon as={LuSearch} boxSize={4} />
          </Box>
          <Combobox.Input
            data-testid="taxon-input"
            placeholder="Scientific or common name"
            ps={8}
            bg="bg"
          />
          <Combobox.IndicatorGroup>
            {state === 'loading' && term.length >= MIN_CHARS && <Spinner size="xs" color="fg.muted" />}
            <Combobox.ClearTrigger aria-label="Clear search" />
          </Combobox.IndicatorGroup>
        </Combobox.Control>
        <Portal>
          <Combobox.Positioner>
            <Combobox.Content w="400px" maxW="calc(100vw - 32px)" maxH="380px" aria-busy={state === 'loading'}>
              <Combobox.Empty px={3} py={2.5} fontSize="sm" color="fg.muted">
                {emptyText}
              </Combobox.Empty>
              {visible.map((t) => (
                <Combobox.Item key={t.name} item={t} data-testid="taxon-option" px={3} py={1.5} opacity={state === 'loading' ? 0.6 : 1}>
                  <SuggestionRow t={t} />
                </Combobox.Item>
              ))}
            </Combobox.Content>
          </Combobox.Positioner>
        </Portal>
      </Combobox.Root>
      <TaxonChips />
    </Box>
  );
});
