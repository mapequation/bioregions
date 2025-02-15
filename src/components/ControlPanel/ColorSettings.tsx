import { observer } from 'mobx-react';
import { Flex, VStack, Spacer, Box, Field, Tag } from '@chakra-ui/react';
import { useState } from 'react';
import { useStore } from '../../store';
import { SchemeName } from '@mapequation/c3';
import ColorPicker from './ColorPicker';
import { Switch } from '../ui/switch';
import Select from './Select';
import { Slider } from '../ui/slider';

export default observer(function Map() {
  const { mapStore, colorStore, infomapStore } = useStore();
  const [showColorSettings, setShowColorSettings] = useState(false);
  // const [showWaterColor, setShowWaterColor] = useState(false);
  // const [showLandColor, setShowLandColor] = useState(false);

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
    return (e: { value: [number, number] }) => {
      setValue(e.value);
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
    <VStack w="100%">
      <Field.Root display="flex" flexDir="row" w="100%" alignItems="center">
        <Field.Label htmlFor="color-settings-switch" mb="0">
          Color settings
        </Field.Label>
        <Spacer />
        <Switch
          id="color-settings-switch"
          checked={showColorSettings}
          onCheckedChange={() => setShowColorSettings(!showColorSettings)}
        />
      </Field.Root>

      {showColorSettings && (
        <Box mt={10} minW={250}>
          <Box p={4}>
            <Flex alignItems="center">
              <Box mx={2}>Land</Box>
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
          </Box>
          <Flex>
            <Select
              id="colorScale"
              label="Color scheme"
              value={[colorStore.scheme as string]}
              onValueChange={(e) => {
                colorStore.setScheme(e.value[0]! as SchemeName);
                if (mapStore.renderType === 'bioregions') {
                  mapStore.render();
                }
              }}
              items={[
                { label: 'Sinebow', value: 'Sinebow' },
                { label: 'Rainbow', value: 'Rainbow' },
                { label: 'Turbo', value: 'Turbo' },
                { label: 'Viridis', value: 'Viridis' },
                { label: 'Greys', value: 'Greys' },
              ]}
            />
          </Flex>
          <Flex w="100%" mt={4} alignItems="flex-end">
            <Tag.Root height={5}>
              <Tag.Label width={10}>{colorStore.saturation}</Tag.Label>
            </Tag.Root>
            <Slider
              w="100%"
              size="sm"
              label="Saturation"
              mx={2}
              value={[colorStore.saturation, colorStore.saturationEnd]}
              min={0}
              max={1}
              step={0.01}
              onValueChange={withRenderTypeRange(
                colorStore.setSaturationRange,
                'bioregions',
              )}
            />
            <Tag.Root height={5}>
              <Tag.Label width={10}>{colorStore.saturationEnd}</Tag.Label>
            </Tag.Root>
          </Flex>

          <Flex w="100%" mt={4} alignItems="flex-end">
            <Tag.Root height={5}>
              <Tag.Label width={10}>{colorStore.lightness}</Tag.Label>
            </Tag.Root>
            <Slider
              w="100%"
              size="sm"
              label="Lightness"
              mx={2}
              value={[colorStore.lightness, colorStore.lightnessEnd]}
              min={0}
              max={1}
              step={0.01}
              onValueChange={withRenderTypeRange(
                colorStore.setLightnessRange,
                'bioregions',
              )}
            />
            <Tag.Root height={5}>
              <Tag.Label width={10}>{colorStore.lightnessEnd}</Tag.Label>
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
              value={[colorStore.strength]}
              min={0}
              max={1}
              step={0.01}
              onValueChange={withRenderType(
                colorStore.setStrength,
                'bioregions',
              )}
            />
          </Flex>

          <Flex w="100%" mt={4} alignItems="flex-end">
            <Tag.Root height={5}>
              <Tag.Label width={10}>{colorStore.offset}</Tag.Label>
            </Tag.Root>
            <Slider
              w="100%"
              size="sm"
              label="Offset"
              mx={2}
              value={[colorStore.offset]}
              min={0}
              max={1}
              step={0.01}
              onValueChange={withRenderType(colorStore.setOffset, 'bioregions')}
            />
          </Flex>

          <Flex mt={4}>
            <Field.Root display="flex" flexDir="row" alignItems="center">
              <Field.Label htmlFor="reverse" mb="0">
                Reverse
              </Field.Label>
              <Switch
                id="reverse"
                checked={colorStore.reverse}
                onCheckedChange={withRenderToggle(
                  colorStore.toggleReverse,
                  'bioregions',
                )}
              />
            </Field.Root>
          </Flex>
          <Flex mt={4}>
            <Field.Root display="flex" flexDir="row" alignItems="center">
              <Field.Label htmlFor="useFlow" mb="0">
                Use flow
              </Field.Label>
              <Switch
                id="useFlow"
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
        </Box>
      )}
    </VStack>
  );
});
