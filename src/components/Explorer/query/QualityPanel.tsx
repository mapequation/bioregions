import { createListCollection, Field, HStack, Stack, Text } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { QUALITY_PRESETS } from '@/sources';
import type { DedupeMode } from '@/sources/types';
import { useStore } from '../../../store';
import type { Preset } from '../../../store/explorer/types';
import { Radio, RadioGroup } from '../../ui/radio';
import { SelectContent, SelectItem, SelectLabel, SelectRoot, SelectTrigger, SelectValueText } from '../../ui/select';
import { Switch } from '../../ui/switch';
import { InfoTip } from '../../ui/toggle-tip';
import NumberField from './NumberField';

const PRESET_HELP: Record<Preset, string> = {
  recommended:
    'Recommended for bioregionalisation: wild, present, species-level records with coordinates precise to 10 km, no geospatial issues, no fossil or captive specimens; one record per species and site.',
  permissive: QUALITY_PRESETS.permissive.description,
  custom: 'You changed individual filters. Pick a preset to reset them.',
};

const DEDUPE = createListCollection<{ value: DedupeMode; label: string; short: string }>({
  items: [
    { value: 'none', label: 'Keep all', short: 'Keep all' },
    { value: 'exact', label: 'One per species per site (~11 m)', short: 'One per site (~11 m)' },
    { value: 'cell', label: 'One per species per ~1 km cell', short: 'One per ~1 km cell' },
  ],
});

const LABEL_PROPS = { fontSize: 'sm', fontWeight: 'medium', color: 'fg' } as const;

/** Quality preset, uncertainty, missing-uncertainty switch, dedupe and minimum records per species. */
export default observer(function QualityPanel() {
  const { explorerStore } = useStore();
  const q = explorerStore.query.quality;
  const preset = explorerStore.preset;
  const km = q.maxUncertaintyMeters == null ? null : q.maxUncertaintyMeters / 1000;

  return (
    <Stack gap={4}>
      <Stack gap={2}>
        <RadioGroup
          size="sm"
          value={preset}
          onValueChange={(e) => e.value && explorerStore.applyPreset(e.value as Preset)}
          data-testid="quality-preset"
          aria-label="Quality preset"
        >
          <Stack gap={1.5}>
            <Radio value="recommended">Recommended</Radio>
            <Radio value="permissive">Permissive</Radio>
            <Radio value="custom" disabled={preset !== 'custom'}>
              Custom
            </Radio>
          </Stack>
        </RadioGroup>
        <Text fontSize="xs" color="fg.muted" lineHeight="short">
          {PRESET_HELP[preset]}
        </Text>
      </Stack>

      <Field.Root>
        <HStack gap={1}>
          <Field.Label {...LABEL_PROPS} htmlFor="explorer-uncertainty">
            Max. coordinate uncertainty
          </Field.Label>
          <InfoTip>
            Records less precise than this can fall in the wrong grid cell. 10 km suits cells of 1° or larger.
          </InfoTip>
        </HStack>
        <HStack gap={2}>
          <NumberField
            id="explorer-uncertainty"
            label="Maximum coordinate uncertainty in km"
            testId="uncertainty-input"
            value={km}
            placeholder="No limit"
            min={0.01}
            max={1000}
            step={1}
            w="104px"
            onCommit={(v) => explorerStore.setQuality({ maxUncertaintyMeters: v == null ? null : Math.round(v * 1000) })}
          />
          <Text fontSize="sm" color="fg.muted">
            km
          </Text>
        </HStack>
        <Switch
          size="sm"
          mt={1.5}
          checked={q.keepMissingUncertainty}
          disabled={q.maxUncertaintyMeters == null}
          onCheckedChange={(e) => explorerStore.setQuality({ keepMissingUncertainty: e.checked })}
        >
          <Text as="span" fontSize="xs" color="fg.muted" lineHeight="short">
            Keep records with no uncertainty reported
          </Text>
        </Switch>
      </Field.Root>

      <Field.Root>
        <Field.Label {...LABEL_PROPS}>Duplicates per species</Field.Label>
        <SelectRoot
          // Mount the portalled content on open: the explorer dialog aria-hides body children present when it opens.
          lazyMount
          unmountOnExit
          collection={DEDUPE}
          size="sm"
          value={[q.dedupe]}
          onValueChange={(e) => e.value[0] && explorerStore.setQuality({ dedupe: e.value[0] as DedupeMode })}
        >
          <SelectLabel srOnly>Duplicates</SelectLabel>
          <SelectTrigger data-testid="dedupe-select" bg="bg">
            <SelectValueText>
              {(items) => (items[0] as { short?: string } | undefined)?.short ?? ''}
            </SelectValueText>
          </SelectTrigger>
          <SelectContent>
            {DEDUPE.items.map((i) => (
              <SelectItem key={i.value} item={i}>
                {i.label}
              </SelectItem>
            ))}
          </SelectContent>
        </SelectRoot>
        <Field.HelperText fontSize="xs" color="fg.muted">
          Applied while loading; the preview counts every record.
        </Field.HelperText>
      </Field.Root>

      <Field.Root>
        <Field.Label {...LABEL_PROPS} htmlFor="explorer-min-records">
          Min. records per species
        </Field.Label>
        <NumberField
          id="explorer-min-records"
          label="Minimum records per species"
          testId="min-records-input"
          value={q.minRecordsPerSpecies ?? 1}
          min={1}
          max={1000}
          w="104px"
          onCommit={(v) => explorerStore.setQuality({ minRecordsPerSpecies: v == null ? 1 : Math.round(v) })}
        />
        <Field.HelperText fontSize="xs" color="fg.muted">
          Rarer species are dropped at load time. 1 keeps every species.
        </Field.HelperText>
      </Field.Root>
    </Stack>
  );
});
