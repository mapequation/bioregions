import { median } from "d3-array";

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

export function isEqual(a: number, b: number, threshold: number = 1e-6) {
  return Math.abs(b - a) <= threshold;
}

/**
 * Interpolate exponentially from [0,1] to [0,1]
 */
export function interpolateExp(x: number, a: number = 1) {
  // return (Math.exp(x + 1) - Math.E) / EXP2_MINUS_E;
  return (Math.exp(a * x + 1) - Math.E) / (Math.exp(a + 1) - Math.E);
}

/**
 * Interpolate logarithmically from [0,1] to [0,1]
 */
export function interpolateLog(x: number, a: number = 1) {
  // return Math.log(x + 1) / LN2;
  return Math.log(a * x + 1) / Math.log(a + 1);
}

/**
 * Tsallis entropy of uniform probability distribution
 * @param k Number of categories
 * @param q Order parameter
 * @returns Tsallis entropy of uniform distribution
 */
export function uniformTsallisEntropy(k: number, q: number) {
  if (isEqual(q, 1)) {
    return Math.log(k);
  }
  return 1 / (q - 1) * (1 - k ** (1 - q));
}

/**
 * Calculates the mean and standard deviation of an array of numbers.
 * @param numbers - An array of numbers.
 * @returns An object containing the mean and standard deviation.
 * 
 * Example usage
 * const numbers = [1, 2, 3, 4, 5];
 * const stats = calculateStats(numbers);
 * console.log(stats); // { mean: 3, stddev: 1.4142135623730951 }
 */
export function calculateStats(numbers: number[]): { mean: number; stddev: number } {
  if (numbers.length === 0) {
    throw new Error("The array must contain at least one number.");
  }

  let sum = 0;
  let sumOfSquares = 0;
  const n = numbers.length;

  for (const num of numbers) {
    sum += num;
    sumOfSquares += num * num;
  }

  const mean = sum / n;
  const variance = sumOfSquares / n - mean * mean;
  const stddev = Math.sqrt(variance);

  return { mean, stddev };
}

export function calcMedian(numbers: number[]) {
  return median(numbers) ?? 0;
}