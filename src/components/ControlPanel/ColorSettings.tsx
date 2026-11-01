import { observer } from 'mobx-react';
import { Flex, VStack, Box, Field, Tag } from '@chakra-ui/react';
import { useStore } from '../../store';
import ColorPicker from './ColorPicker';
import { Switch } from '../ui/switch';
import Select from './Select';
import { Slider } from '../ui/slider';
import {
  COLOR_SCHEMES,
  tonesFor,
  type SchemeName,
  type ToneChoice,
} from '@/store/ColorStore';

export default observer(function ColorSettings() {
  const { mapStore, colorStore, infomapStore } = useStore();
  // The Mural colors are fixed, so only the palette choice applies to them
  const isMural = colorStore.scheme === 'Mural';
  const swatches = colorStore.bioregionColors.slice(
    0,
    Math.min(infomapStore.numBioregions, 16),
  );

  const withRender = (setValue: (v: string) => void) => {
    return (value: string) => {
      setValue(value);
      mapStore.render();
    };
  };

  const withRenderType = (
    setValue: (v: number) => void,
    renderType: typeof mapStore.renderType,
  ) => {
    return (e: { value: number[] }) => {
      setValue(e.value[0]);
      if (mapStore.renderType === renderType) {
        mapStore.render();
      }
    };
  };

  const withRenderTypeRange = (
    setValue: (v: [number, number]) => void,
    renderType: typeof mapStore.renderType,
  ) => {
    return (e: { value: number[] }) => {
      setValue([e.value[0], e.value[1]]);
      if (mapStore.renderType === renderType) {
        mapStore.render();
      }
    };
  };

  const withRenderToggle = (
    toggle: () => void,
    renderType: typeof mapStore.renderType,
  ) => {
    return () => {
      toggle();
      if (mapStore.renderType === renderType) {
        mapStore.render();
      }
    };
  };

  return (
    <VStack w="100%" alignItems="stretch">
      <Flex>
        <Select
          id="colorScale"
          label="Palette"
          value={[colorStore.scheme as string]}
          onValueChange={(e) => {
            colorStore.setScheme(e.value[0] as SchemeName);
            if (mapStore.renderType === 'bioregions') {
              mapStore.render();
            }
          }}
          items={COLOR_SCHEMES}
        />
      </Flex>
      <Flex mt={2}>
        <Select
          id="colorTone"
          label="Tone"
          disabled={isMural}
          value={[colorStore.tone]}
          onValueChange={(e) => {
            colorStore.setTone(e.value[0] as ToneChoice);
            if (mapStore.renderType === 'bioregions') {
              mapStore.render();
            }
          }}
          items={tonesFor(colorStore.scheme)}
        />
      </Flex>

      {swatches.length > 0 && (
        <Flex
          mt={2}
          gap="2px"
          role="img"
          aria-label={`Bioregion colors: ${infomapStore.numBioregions}`}
        >
          {/* The palette gives distinct colors, so a color is a stable key */}
          {swatches.map((color) => (
            <Box key={color} w={4} h={4} borderRadius="sm" bg={color} />
          ))}
        </Flex>
      )}

      <Flex w="100%" mt={4} alignItems="flex-end">
        <Tag.Root height={5}>
          <Tag.Label width={10}>{colorStore.lightness[0]}</Tag.Label>
        </Tag.Root>
        <Slider
          w="100%"
          size="sm"
          label="Lightness"
          mx={2}
          disabled={isMural}
          value={colorStore.lightness}
          min={0}
          max={1}
          step={0.01}
          onValueChange={withRenderTypeRange(
            colorStore.setLightnessRange,
            'bioregions',
          )}
        />
        <Tag.Root height={5}>
          <Tag.Label width={10}>{colorStore.lightness[1]}</Tag.Label>
        </Tag.Root>
      </Flex>

      <Flex w="100%" mt={4} alignItems="flex-end">
        <Tag.Root height={5}>
          <Tag.Label width={10}>{colorStore.strength}</Tag.Label>
        </Tag.Root>
        <Slider
          w="100%"
          size="sm"
          label="Weight strength"
          mx={2}
          disabled={isMural}
          value={[colorStore.strength]}
          min={0}
          max={1}
          step={0.01}
          onValueChange={withRenderType(colorStore.setStrength, 'bioregions')}
        />
      </Flex>

      <Flex w="100%" mt={4} alignItems="flex-end">
        <Tag.Root height={5}>
          <Tag.Label width={10}>{colorStore.offset.toFixed(2)}</Tag.Label>
        </Tag.Root>
        <Slider
          w="100%"
          size="sm"
          label="Offset"
          mx={2}
          disabled={isMural}
          value={[colorStore.offset]}
          min={0}
          max={1}
          step={0.01}
          onValueChange={withRenderType(colorStore.setOffset, 'bioregions')}
        />
      </Flex>

      <Flex mt={4}>
        <Field.Root
          display="flex"
          flexDir="row"
          alignItems="center"
          disabled={isMural}
        >
          <Field.Label htmlFor="reverse" mb="0">
            Reverse
          </Field.Label>
          <Switch
            id="reverse"
            disabled={isMural}
            checked={colorStore.reverse}
            onCheckedChange={withRenderToggle(
              colorStore.toggleReverse,
              'bioregions',
            )}
          />
        </Field.Root>
      </Flex>
      <Flex mt={4}>
        <Field.Root
          display="flex"
          flexDir="row"
          alignItems="center"
          disabled={isMural}
        >
          <Field.Label htmlFor="useFlow" mb="0">
            Use flow
          </Field.Label>
          <Switch
            id="useFlow"
            disabled={isMural}
            checked={colorStore.useFlow}
            onCheckedChange={withRenderToggle(
              colorStore.toggleUseFlow,
              'bioregions',
            )}
          />
        </Field.Root>
      </Flex>
      {infomapStore.haveStateNetwork && (
        <Flex mt={4}>
          <Field.Root display="flex" flexDir="row" alignItems="center">
            <Field.Label htmlFor="hideDominantOverlappingModule" mb="0">
              Hide dominant overlapping module
            </Field.Label>
            <Switch
              id="hideDominantOverlappingModule"
              checked={colorStore.hideDominantOverlappingModule}
              onCheckedChange={withRenderToggle(
                colorStore.toggleHideDominantOverlappingModule,
                'bioregions',
              )}
            />
          </Field.Root>
        </Flex>
      )}

      <Flex mt={4} alignItems="center">
        <Box mr={2}>Land</Box>
        <ColorPicker
          color={mapStore.landColor}
          onChange={withRender(mapStore.setLandColor)}
          label="Land color"
        />
        <Box mx={2}>Water</Box>
        <ColorPicker
          color={mapStore.waterColor}
          onChange={withRender(mapStore.setWaterColor)}
          label="Water color"
        />
      </Flex>
    </VStack>
  );
});
