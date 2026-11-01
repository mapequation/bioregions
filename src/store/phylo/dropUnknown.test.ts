import { expect, it } from 'vitest';
import { HttpError } from '@/sources';
import { dropUnknownIds } from './dropUnknown';

const reject = (ids: number[]) =>
  new HttpError(400, JSON.stringify({ unknown: Object.fromEntries(ids.map((id) => [`ott${id}`, 'pruned_ott_id'])) }), 'https://api.opentreeoflife.org/v3/x');

it('drops ids the API rejects and retries', async () => {
  const calls: number[][] = [];
  const { result, dropped } = await dropUnknownIds([1, 2, 3, 2], async (ids) => {
    calls.push(ids);
    if (ids.includes(2)) throw reject([2]);
    return ids.length;
  });
  expect(result).toBe(2);
  expect(dropped).toEqual([2]);
  expect(calls).toEqual([[1, 2, 3], [1, 3]]);
});

it('rethrows other errors and fails when nothing is left', async () => {
  await expect(dropUnknownIds([1], async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
  await expect(dropUnknownIds([1], async () => Promise.reject(reject([1])))).rejects.toThrow(/None of the taxa/);
});
