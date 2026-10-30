import { Box } from '@chakra-ui/react';

export interface ShareBarProps {
  value: number;
  max: number;
  /**
   * solid: strong fill (totals); muted: soft fill of the palette (non-additive amounts such as
   * "each filter alone"); ghost: only a dashed tick at `ghostValue` (or `value`).
   */
  variant?: 'solid' | 'muted' | 'ghost';
  colorPalette?: string;
  /** Bar height in px (default 8). */
  height?: number;
  /** Draws a dashed reference tick, e.g. the value at the last load or a threshold. */
  ghostValue?: number;
  /** Accessible description; without it the bar is hidden from assistive tech. */
  label?: string;
  /** Where the bar starts (same units as `value`), for waterfall steps. Default 0. */
  start?: number;
  /** Draws a faint full-width track behind the bar. */
  track?: boolean;
  /** Hides the bar (not the tick) when `value / max` is below this share. Default 0. */
  hideBelow?: number;
}

const fraction = (v: number, max: number) => (max > 0 ? Math.min(1, Math.max(0, v / max)) : 0);

/** Horizontal share bar on semantic tokens, the bar primitive of the explorer charts. */
export default function ShareBar({
  value,
  max,
  variant = 'solid',
  colorPalette = 'brand',
  height = 8,
  ghostValue,
  label,
  start = 0,
  track = false,
  hideBelow = 0,
}: ShareBarProps) {
  const left = fraction(start, max);
  const w = Math.min(1 - left, fraction(value, max));
  const visible = variant !== 'ghost' && value > 0 && w >= hideBelow;
  const tick = variant === 'ghost' ? (ghostValue ?? value) : ghostValue;
  return (
    <Box
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      position="relative"
      w="full"
      h={`${height}px`}
      flexShrink={0}
      colorPalette={colorPalette}
      bg={track ? 'bg.muted' : undefined}
      borderRadius="1px"
    >
      {visible && (
        <Box
          position="absolute"
          top={0}
          bottom={0}
          left={`${left * 100}%`}
          w={`${w * 100}%`}
          minW="2px"
          borderRadius="1px"
          bg={variant === 'solid' ? 'colorPalette.solid' : 'colorPalette.emphasized'}
          transitionProperty="width, left"
          transitionDuration="moderate"
          _motionReduce={{ transition: 'none' }}
        />
      )}
      {tick != null && (
        <Box
          position="absolute"
          top="-3px"
          bottom="-3px"
          left={`calc(${fraction(tick, max) * 100}% - 1px)`}
          borderLeftWidth="2px"
          borderLeftStyle="dotted"
          borderColor="fg"
          opacity={0.7}
        />
      )}
    </Box>
  );
}
