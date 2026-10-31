import type { ButtonProps } from '@chakra-ui/react';

/**
 * Shared button styles for the explorer's next-step actions, so every primary action has one
 * fill in both colour modes: near-black on light, near-white on dark (the gray solid recipe).
 * Spread them first so a call site can still override, e.g. `<Button {...primaryButtonProps} flex="1">`.
 */
export const primaryButtonProps = {
  size: 'sm',
  variant: 'solid',
  colorPalette: 'gray',
  _hover: { bg: 'colorPalette.solid/85' },
  _active: { bg: 'colorPalette.solid/75' },
  _expanded: { bg: 'colorPalette.solid/85' },
  focusVisibleRing: 'outside',
  focusRingColor: 'colorPalette.focusRing',
  _disabled: { opacity: 0.45, cursor: 'not-allowed', _hover: { bg: 'colorPalette.solid' } },
} as const satisfies ButtonProps;

/** Secondary next-step action (and a primary action deliberately demoted, e.g. after a partial load). */
export const secondaryButtonProps = {
  size: 'sm',
  variant: 'outline',
  colorPalette: 'gray',
  bg: 'bg',
  borderColor: 'border.emphasized',
  _hover: { bg: 'bg.muted' },
  _active: { bg: 'bg.emphasized' },
  _expanded: { bg: 'bg.muted' },
  focusVisibleRing: 'outside',
  focusRingColor: 'colorPalette.focusRing',
  _disabled: { opacity: 0.45, cursor: 'not-allowed', _hover: { bg: 'bg' } },
} as const satisfies ButtonProps;
