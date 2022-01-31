/**
 * Range generator for iterating the interval [start, stop) with a
 * specified `step` size, default 1.
 * If only one value is provided, it is used as stop value, implicitly setting start to zero.
 * If the `inclusive` option is true, iterate the interval [start, stop].
 * @param start Start value
 * @param stop Stop value, will not yield this but stop before
 * @param step Interval to step
 * @param options Options to use inclusive range
 */
export function* range(
  start: number,
  stop: number | undefined = undefined,
  step: number = 1,
  options: {
    inclusive: boolean;
  } = { inclusive: false },
) {
  if (stop === undefined) {
    // If only one value provided, use that as stop
    stop = start;
    start = 0;
  }

  if (options.inclusive) {
    for (let i = start; step > 0 ? i <= stop : i >= stop; i += step) {
      yield i;
    }
  } else {
    for (let i = start; step > 0 ? i < stop : i > stop; i += step) {
      yield i;
    }
  }
}

export function rangeArray(
  start: number,
  stop: number | undefined = undefined,
  step: number = 1,
  options: {
    inclusive: boolean;
  } = { inclusive: false },
) {
  return Array.from(range(start, stop, step, options));
}

export function rangeArrayOneSignificant(
  start: number,
  stop: number | undefined = undefined,
  options: {
    inclusive: boolean;
  } = { inclusive: false },
) {
  if (stop === undefined) {
    // If only one value provided, use that as stop
    stop = start;
    start = 0;
  }

  const values = [];
  if (start === 0) {
    values.push(0);
  }
  for (const order of range(start, stop)) {
    for (const d of range(1, 10)) {
      values.push(d * Math.pow(10, order));
    }
  }
  if (options.inclusive) {
    values.push(Math.pow(10, stop!));
  }
  return values;
}
