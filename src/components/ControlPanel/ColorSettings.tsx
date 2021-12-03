import { observer } from 'mobx-react';
import {
  Flex,
  Select,
  VStack,
  FormControl,
  FormLabel,
  Switch,
  Spacer,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  Box,
} from '@chakra-ui/react';
import { useState } from 'react';
import { useStore } from '../../store';
import { SchemeName } from '@mapequation/c3';

export default observer(function Map() {
  const { mapStore, colorStore } = useStore();
  const [showColorSettings, setShowColorSettings] = useState(false);

  const withRender = (
    setValue: (v: number) => void,
    renderType: typeof mapStore.renderType,
  ) => {
    return (value: number) => {
      setValue(value);
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
      <FormControl display="flex" w="100%" alignItems="center">
        <FormLabel htmlFor="color-settings-switch" mb="0">
          Color settings
        </FormLabel>
        <Spacer />
        <Switch
          id="color-settings-switch"
          isChecked={showColorSettings}
          onChange={() => setShowColorSettings(!showColorSettings)}
        />
      </FormControl>

      {showColorSettings && (
        <Box mt={10} minW={250}>
          <Flex>
            <Select
              id="colorScale"
              value={colorStore.scheme}
              onChange={(e) => {
                colorStore.setScheme(e.target?.value! as SchemeName);
                if (mapStore.renderType === 'bioregions') {
                  mapStore.render();
                }
              }}
            >
              <option value="Sinebow">Sinebow</option>
              <option value="Rainbow">Rainbow</option>
              <option value="Turbo">Turbo</option>
              <option value="Viridis">Viridis</option>
              <option value="Greys">Greys</option>
            </Select>
          </Flex>
          <Flex mt={4}>
            <Slider
              focusThumbOnChange={false}
              value={colorStore.saturation}
              onChange={withRender(colorStore.setSaturation, 'bioregions')}
              min={0}
              max={1}
              step={0.01}
            >
              <SliderTrack>
                <SliderFilledTrack />
              </SliderTrack>
              <SliderThumb fontSize="sm" boxSize="32px">
                {colorStore.saturation}
              </SliderThumb>
            </Slider>
            <Box mx={10}>Saturation</Box>
          </Flex>
          <Flex mt={4}>
            <Slider
              focusThumbOnChange={false}
              value={colorStore.saturationEnd}
              onChange={withRender(colorStore.setSaturationEnd, 'bioregions')}
              min={0}
              max={1}
              step={0.01}
            >
              <SliderTrack>
                <SliderFilledTrack />
              </SliderTrack>
              <SliderThumb fontSize="sm" boxSize="32px">
                {colorStore.saturationEnd}
              </SliderThumb>
            </Slider>
            <Box mx={10}>SaturationEnd</Box>
          </Flex>
          <Flex mt={4}>
            <Slider
              focusThumbOnChange={false}
              value={colorStore.lightness}
              onChange={withRender(colorStore.setLightness, 'bioregions')}
              min={0}
              max={1}
              step={0.01}
            >
              <SliderTrack>
                <SliderFilledTrack />
              </SliderTrack>
              <SliderThumb fontSize="sm" boxSize="32px">
                {colorStore.lightness}
              </SliderThumb>
            </Slider>
            <Box mx={10}>Lightness</Box>
          </Flex>
          <Flex mt={4}>
            <Slider
              focusThumbOnChange={false}
              value={colorStore.lightnessEnd}
              onChange={withRender(colorStore.setLightnessEnd, 'bioregions')}
              min={0}
              max={1}
              step={0.01}
            >
              <SliderTrack>
                <SliderFilledTrack />
              </SliderTrack>
              <SliderThumb fontSize="sm" boxSize="32px">
                {colorStore.lightnessEnd}
              </SliderThumb>
            </Slider>
            <Box mx={10}>LightnessEnd</Box>
          </Flex>
          <Flex mt={4}>
            <Slider
              focusThumbOnChange={false}
              value={colorStore.strength}
              onChange={withRender(colorStore.setStrength, 'bioregions')}
              min={0}
              max={1}
              step={0.01}
            >
              <SliderTrack>
                <SliderFilledTrack />
              </SliderTrack>
              <SliderThumb fontSize="sm" boxSize="32px">
                {colorStore.strength}
              </SliderThumb>
            </Slider>
            <Box mx={10}>Weight strength</Box>
          </Flex>
          <Flex mt={4}>
            <Slider
              focusThumbOnChange={false}
              value={colorStore.offset}
              onChange={withRender(colorStore.setOffset, 'bioregions')}
              min={0}
              max={1}
              step={0.01}
            >
              <SliderTrack>
                <SliderFilledTrack />
              </SliderTrack>
              <SliderThumb fontSize="sm" boxSize="32px">
                {colorStore.offset}
              </SliderThumb>
            </Slider>
            <Box mx={14}>Offset</Box>
          </Flex>
          <Flex mt={4} display="none">
            <Slider
              focusThumbOnChange={false}
              value={colorStore.strength}
              onChange={withRender(colorStore.setStrength, 'bioregions')}
              min={0}
              max={1}
              step={0.01}
            >
              <SliderTrack>
                <SliderFilledTrack />
              </SliderTrack>
              <SliderThumb fontSize="sm" boxSize="32px">
                {colorStore.strength}
              </SliderThumb>
            </Slider>
            <Box mx={10}>Strength</Box>
          </Flex>
          <Flex mt={4}>
            <FormControl display="flex" alignItems="center">
              <FormLabel htmlFor="reverse" mb="0">
                Reverse
              </FormLabel>
              <Switch
                id="reverse"
                isChecked={colorStore.reverse}
                onChange={withRenderToggle(
                  colorStore.toggleReverse,
                  'bioregions',
                )}
              />
            </FormControl>
          </Flex>
          <Flex mt={4}>
            <FormControl display="flex" alignItems="center">
              <FormLabel htmlFor="useFlow" mb="0">
                Use flow
              </FormLabel>
              <Switch
                id="useFlow"
                isChecked={colorStore.useFlow}
                onChange={withRenderToggle(
                  colorStore.toggleUseFlow,
                  'bioregions',
                )}
              />
            </FormControl>
          </Flex>
        </Box>
      )}
    </VStack>
  );
});
