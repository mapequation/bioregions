import {
  Box,
  Button,
  Collapsible,
  chakra,
  createListCollection,
  Grid,
  HStack,
  Icon,
  IconButton,
  Input,
  InputGroup,
  Stack,
  Tag,
  Text,
  Wrap,
} from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { useMemo, useState } from 'react';
import { LuChevronRight, LuGlobe, LuSearch, LuSquareDashedMousePointer, LuX } from 'react-icons/lu';
import { COUNTRIES, countryName, REGION_PRESETS, regionByBbox } from '@/sources';
import type { AreaFilter, BBox } from '@/sources/types';
import { useStore } from '../../../store';
import { Checkbox } from '../../ui/checkbox';
import { PopoverBody, PopoverContent, PopoverRoot, PopoverTrigger } from '../../ui/popover';
import {
  SelectContent,
  SelectItem,
  SelectItemGroup,
  SelectLabel,
  SelectRoot,
  SelectTrigger,
  SelectValueText,
} from '../../ui/select';
import { Tooltip } from '../../ui/tooltip';
import { explorerUi } from '../explorerUi';
import NumberField from './NumberField';

interface AreaItem {
  value: string;
  label: string;
  group: string;
  disabled?: boolean;
}

const WORLD_BBOX: BBox = [-180, -90, 180, 90];
const GROUP_ORDER = ['Global', 'Continent', 'Biogeographic realm', 'Ocean', 'Current'];

/** The select value that represents `area`. */
function areaValue(area: AreaFilter): string {
  if (area.kind === 'world') return 'world';
  if (area.kind === 'bbox') return regionByBbox(area.bbox)?.id ?? 'custom-box';
  if (area.kind === 'countries') return 'countries';
  return 'polygon';
}

const BASE_ITEMS: AreaItem[] = [
  { value: 'world', label: 'World', group: 'Global' },
  ...REGION_PRESETS.map((r) => ({ value: r.id, label: r.label, group: r.group })),
];

const CountryPicker = observer(function CountryPicker() {
  const { explorerStore } = useStore();
  const area = explorerStore.query.area;
  const codes = area.kind === 'countries' ? area.codes : [];
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return COUNTRIES;
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(s) || c.code.toLowerCase() === s);
  }, [search]);
  const selected = new Set(codes);

  const setCodes = (next: string[]) => {
    explorerStore.setArea(next.length > 0 ? { kind: 'countries', codes: next } : { kind: 'world' });
  };
  const toggle = (code: string, on: boolean) => {
    setCodes(on ? [...codes, code] : codes.filter((c) => c !== code));
  };

  return (
    <PopoverRoot
      lazyMount
      unmountOnExit
      positioning={{ placement: 'bottom-start' }}
      onOpenChange={(e) => !e.open && setSearch('')}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant={codes.length > 0 ? 'subtle' : 'outline'}
          flex="1"
          minW={0}
          data-testid="area-countries"
          aria-label={codes.length > 0 ? `Countries: ${codes.length} selected` : 'Choose countries'}
        >
          <Icon as={LuGlobe} />
          <Text as="span" truncate>
            {codes.length === 0 ? 'Countries…' : codes.length === 1 ? countryName(codes[0]) : `${codes.length} countries`}
          </Text>
        </Button>
      </PopoverTrigger>
      <PopoverContent w="300px">
        <PopoverBody p={0}>
          <Box p={2.5} borderBottomWidth="1px">
            <InputGroup startElement={<LuSearch />}>
              <Input
                size="sm"
                placeholder="Search countries"
                aria-label="Search countries"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </InputGroup>
            {codes.length > 0 && (
              <Wrap gap={1} mt={2}>
                {codes.map((c) => (
                  <Tag.Root key={c} size="sm" variant="surface">
                    <Tag.Label>{countryName(c)}</Tag.Label>
                    <Tag.EndElement>
                      <Tag.CloseTrigger aria-label={`Remove ${countryName(c)}`} onClick={() => toggle(c, false)} />
                    </Tag.EndElement>
                  </Tag.Root>
                ))}
              </Wrap>
            )}
          </Box>
          <Stack as="ul" role="group" aria-label="Countries" gap={0} maxH="260px" overflowY="auto" py={1} listStyleType="none">
            {filtered.length === 0 && (
              <Text as="li" px={3} py={2} fontSize="sm" color="fg.muted">
                No country matches “{search.trim()}”.
              </Text>
            )}
            {filtered.map((c) => (
              <Box as="li" key={c.code} px={3} py={1} _hover={{ bg: 'bg.muted' }}>
                <Checkbox
                  size="sm"
                  w="full"
                  checked={selected.has(c.code)}
                  onCheckedChange={(e) => toggle(c.code, !!e.checked)}
                >
                  <HStack gap={2} w="full">
                    <Text as="span" flex="1" truncate>
                      {c.name}
                    </Text>
                    <Text as="span" fontSize="xs" color="fg.muted" fontFamily="mono">
                      {c.code}
                    </Text>
                  </HStack>
                </Checkbox>
              </Box>
            ))}
          </Stack>
          {codes.length > 0 && (
            <HStack justify="space-between" px={3} py={2} borderTopWidth="1px" fontSize="xs" color="fg.muted">
              <Text fontVariantNumeric="tabular-nums">{codes.length} selected</Text>
              <Button size="xs" variant="ghost" onClick={() => setCodes([])}>
                Clear
              </Button>
            </HStack>
          )}
        </PopoverBody>
      </PopoverContent>
    </PopoverRoot>
  );
});

const CoordinateFields = observer(function CoordinateFields() {
  const { explorerStore } = useStore();
  const area = explorerStore.query.area;
  const bbox: BBox | null = area.kind === 'bbox' ? area.bbox : area.kind === 'world' ? WORLD_BBOX : null;
  const fields: { i: 0 | 1 | 2 | 3; label: string; name: string; min: number; max: number }[] = [
    { i: 0, label: 'W', name: 'West longitude', min: -180, max: 180 },
    { i: 1, label: 'S', name: 'South latitude', min: -90, max: 90 },
    { i: 2, label: 'E', name: 'East longitude', min: -180, max: 180 },
    { i: 3, label: 'N', name: 'North latitude', min: -90, max: 90 },
  ];
  const set = (i: number, v: number | null) => {
    const next = [...(bbox ?? WORLD_BBOX)] as BBox;
    next[i] = v ?? WORLD_BBOX[i];
    if (next[1] >= next[3]) return; // south must stay below north
    const preset = regionByBbox(next);
    explorerStore.setArea({ kind: 'bbox', bbox: next, label: preset?.label });
  };
  return (
    <Stack gap={1.5}>
      <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap={2}>
        {fields.map((f) => (
          <HStack key={f.label} gap={1.5}>
            <chakra.label htmlFor={`explorer-bbox-${f.label}`} fontSize="xs" fontWeight="semibold" color="fg.muted" w={3}>
              {f.label}
            </chakra.label>
            <NumberField
              id={`explorer-bbox-${f.label}`}
              label={f.name}
              value={bbox ? bbox[f.i] : null}
              placeholder="–"
              min={f.min}
              max={f.max}
              step={1}
              w="full"
              onCommit={(v) => set(f.i, v)}
            />
          </HStack>
        ))}
      </Grid>
      <Text fontSize="xs" color="fg.muted">
        Degrees. West greater than east crosses the antimeridian.
      </Text>
    </Stack>
  );
});

/** Study area: preset select, countries, rectangle draw and raw coordinates. */
export default observer(function AreaPicker() {
  const { explorerStore } = useStore();
  const area = explorerStore.query.area;
  const value = areaValue(area);
  const obisOn = explorerStore.query.sources.obis;

  const items = useMemo(() => {
    const extra: AreaItem[] = [];
    if (value === 'custom-box') extra.push({ value, label: 'Custom box', group: 'Current', disabled: true });
    if (value === 'countries') extra.push({ value, label: 'Countries', group: 'Current', disabled: true });
    if (value === 'polygon') extra.push({ value, label: 'Custom polygon', group: 'Current', disabled: true });
    return [...BASE_ITEMS, ...extra];
  }, [value]);
  const collection = useMemo(
    () => createListCollection({ items, isItemDisabled: (i) => !!i.disabled }),
    [items],
  );
  const groups = GROUP_ORDER.map((g) => ({ g, list: items.filter((i) => i.group === g) })).filter((x) => x.list.length > 0);

  return (
    <Stack gap={2}>
      <HStack gap={1.5}>
        <SelectRoot
          // Mount the portalled content on open: the explorer dialog aria-hides body children present when it opens.
          lazyMount
          unmountOnExit
          collection={collection}
          size="sm"
          flex="1"
          minW={0}
          value={[value]}
          onValueChange={(e) => {
            const v = e.value[0];
            if (!v || v === value) return;
            if (v === 'world') explorerStore.setArea({ kind: 'world' });
            const preset = REGION_PRESETS.find((r) => r.id === v);
            if (preset) explorerStore.setArea({ kind: 'bbox', bbox: [...preset.bbox] as BBox, label: preset.label });
          }}
        >
          <SelectLabel srOnly>Area preset</SelectLabel>
          <SelectTrigger data-testid="area-preset" bg="bg">
            <SelectValueText placeholder="Choose an area" />
          </SelectTrigger>
          <SelectContent maxH="320px">
            {groups.map(({ g, list }) => (
              <SelectItemGroup key={g} label={g}>
                {list.map((i) => (
                  <SelectItem key={i.value} item={i}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectItemGroup>
            ))}
          </SelectContent>
        </SelectRoot>
        {area.kind !== 'world' && (
          <Tooltip content="Clear area (search the whole world)" openDelay={300}>
            <IconButton
              aria-label="Clear area (search the whole world)"
              size="sm"
              variant="ghost"
              flex="none"
              data-testid="area-clear"
              onClick={() => explorerStore.setArea({ kind: 'world' })}
            >
              <LuX />
            </IconButton>
          </Tooltip>
        )}
      </HStack>

      <HStack gap={2}>
        <CountryPicker />
        <Tooltip content="Drag a rectangle on the preview map" openDelay={300}>
          <Button
            size="sm"
            variant={explorerUi.drawing ? 'solid' : 'outline'}
            flex="none"
            data-testid="area-draw"
            aria-pressed={explorerUi.drawing}
            onClick={() => explorerUi.setDrawing(!explorerUi.drawing)}
          >
            <LuSquareDashedMousePointer />
            {explorerUi.drawing ? 'Drawing…' : 'Draw'}
          </Button>
        </Tooltip>
      </HStack>
      {explorerUi.drawing && (
        <Text fontSize="xs" color="fg.muted" role="status">
          Drag on the map to set a box. Press Esc to stop drawing.
        </Text>
      )}
      {area.kind === 'countries' && obisOn && (
        <Text fontSize="xs" color="fg.muted">
          OBIS can't filter by country, so only GBIF is used for this area.
        </Text>
      )}

      <Collapsible.Root>
        <Collapsible.Trigger asChild>
          <Button
            size="xs"
            variant="ghost"
            px={1}
            ms={-1}
            color="fg.muted"
            fontWeight="medium"
            css={{ '&[data-state=open] svg': { transform: 'rotate(90deg)' } }}
          >
            <Icon as={LuChevronRight} transition="transform 0.15s" />
            Coordinates W S E N
          </Button>
        </Collapsible.Trigger>
        <Collapsible.Content pt={2}>
          <CoordinateFields />
        </Collapsible.Content>
      </Collapsible.Root>
    </Stack>
  );
});
