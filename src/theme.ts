import {
  createSystem,
  defaultConfig,
  defineRecipe,
  type SystemStyleObject,
} from '@chakra-ui/react';
// import { tableAnatomy as parts } from '@chakra-ui/anatomy';
// import type {
//   PartsStyleFunction,
//   SystemStyleObject,
// } from '@chakra-ui/theme-tools';

const numericStyles: SystemStyleObject = {
  '&[data-is-numeric=true]': {
    textAlign: 'end',
  },
};

const paddingTop = '5px !important';

const tableVariantSimpler: SystemStyleObject = {
  '& thead th': {
    textAlign: 'center !important',
    paddingTop,
    paddingBottom: paddingTop,
  },
  '& td': {
    '&:first-of-type': {
      paddingInlineStart: '0 !important',
      textAlign: 'start',
    },
    '&:last-of-type': {
      paddingInlineEnd: '0 !important',
    },
    textAlign: 'end',
    paddingTop,
    paddingBottom: paddingTop,
  },
  '& tfoot td': {
    borderColor: 'var(--chakra-colors-gray-100) !important',
    borderTop: '1px',
    paddingTop,
    paddingBottom: paddingTop,
    ...numericStyles,
  },
};

const tableRecipe = defineRecipe({
  variants: {
    simpler: {
      true: tableVariantSimpler,
    },
  },
});

const theme = createSystem(defaultConfig, {
  globalCss: {
    html: {
      colorPalette: "brand", // Change this to any color palette you prefer
    },
  },
  theme: {
    recipes: {
      table: tableRecipe,
    },
    tokens: {
      fonts: {
        brand: { value: 'Philosopher' },
        heading: { value: 'Open Sans' },
        body: { value: 'Raleway' },
      },
      colors: {
        brand: {
          50: { value: "#F7FAFC" },
          100: { value: "#EDF2F7" },
          200: { value: "#E2E8F0" },
          300: { value: "#CBD5E0" },
          400: { value: "#A0AEC0" },
          500: { value: "#718096" },
          600: { value: "#4A5568" },
          700: { value: "#2D3748" },
          800: { value: "#1A202C" },
          900: { value: "#171923" },
        },
      },
    },
    semanticTokens: {
      colors: {
        brand: {
          // solid: { value: "{colors.brand.100}" },
          // contrast: { value: "{colors.brand.500}" },
          // fg: { value: "{colors.brand.700}" },
          // muted: { value: "{colors.brand.100}" },
          // subtle: { value: "{colors.brand.200}" },
          // emphasized: { value: "{colors.brand.300}" },
          // focusRing: { value: "{colors.brand.500}" },
          solid: { value: { _light: "{colors.brand.500}", _dark: "{colors.brand.500}" } },
          contrast: { value: { _light: "{colors.brand.50}", _dark: "{colors.brand.100}" } },
          fg: { value: { _light: "{colors.brand.700}", _dark: "{colors.brand.200}" } },
          muted: { value: { _light: "{colors.brand.300}", _dark: "{colors.brand.600}" } },
          subtle: { value: { _light: "{colors.brand.200}", _dark: "{colors.brand.700}" } },
          emphasized: { value: { _light: "{colors.brand.400}", _dark: "{colors.brand.600}" } },
          focusRing: { value: { _light: "{colors.brand.500}", _dark: "{colors.brand.500}" } },
        },
      },
    },
  }
});

export default theme;
