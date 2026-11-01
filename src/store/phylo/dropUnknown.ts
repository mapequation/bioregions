import { parseUnknownIds } from '@/phylo/otol';

/**
 * Call an Open Tree endpoint that rejects the whole request when some OTT ids are not
 * in the synthetic tree (HTTP 400 with an `unknown` map): drop those ids and retry.
 * Throws when nothing is left or the error names no requested id.
 */
export async function dropUnknownIds<T>(
  ottIds: number[],
  call: (ids: number[]) => Promise<T>,
  maxRetries = 5,
): Promise<{ result: T; dropped: number[] }> {
  let ids = [...new Set(ottIds)];
  const dropped: number[] = [];
  for (let attempt = 0; ; attempt++) {
    if (ids.length === 0) {
      throw new Error('None of the taxa are in the Open Tree synthetic tree');
    }
    try {
      return { result: await call(ids), dropped };
    } catch (error) {
      const unknown = new Set(parseUnknownIds(error));
      const drop = ids.filter((id) => unknown.has(id));
      if (drop.length === 0 || attempt >= maxRetries) throw error;
      dropped.push(...drop);
      ids = ids.filter((id) => !unknown.has(id));
    }
  }
}
