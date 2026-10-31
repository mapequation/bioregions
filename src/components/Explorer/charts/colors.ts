// Chart colours as CSS variables of Chakra semantic tokens, so SVG charts follow the
// colour mode without useColorModeValue.
export const chartColors = {
  /** Records removed by a filter or cleaning step. */
  removal: 'var(--chakra-colors-orange-solid)',
  /** Accepted / matching records. */
  accepted: 'var(--chakra-colors-brand-solid)',
  /** Outlines of hollow (marginal impact) bars. */
  outline: 'var(--chakra-colors-fg-muted)',
  /** Gridlines and axes. */
  grid: 'var(--chakra-colors-border)',
  /** Axis and annotation text. */
  text: 'var(--chakra-colors-fg-muted)',
  /** Empty bar tracks. */
  track: 'var(--chakra-colors-bg-muted)',
} as const;

/**
 * Colour palettes (for `colorPalette`) by meaning. Bars use `colorPalette.solid`, which
 * Chakra defines for both colour modes with AA contrast against `bg`.
 */
export const chartPalettes = {
  /** Removal / warning bars (cleaning drops, triggered bias flags). */
  removal: 'orange',
  /** Accepted / matching records and neutral composition bars. */
  accepted: 'brand',
  /** Passed checks. */
  ok: 'green',
} as const;
