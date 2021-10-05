/**
 * Clamp value to [min, max].
 *
 * If either limit is undefined, it will not limit the value in
 * the respective direction. Assumes min <= max.
 * @param value The value to clamp
 * @param min Minimum value, if defined
 * @param max Maximum value, if defined
 * @returns value clamped to [min, max]
 */
export function clamp(value: number, min?: number, max?: number) {
  return min !== undefined && value < min
    ? min
    : max !== undefined && value > max
    ? max
    : value;
}
