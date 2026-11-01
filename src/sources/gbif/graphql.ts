import { delay, postJson, retryDelay, type FetchOptions } from '../http';

export const GBIF_GRAPHQL_URL = 'https://graphql.gbif.org/graphql';
export const GBIF_API_URL = 'https://api.gbif.org/v1';

/** `documents(from, size)` may not reach past this many records per search. */
export const GBIF_MAX_DOCUMENTS = 6000;

export class GbifGraphqlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GbifGraphqlError';
  }
}

interface GraphqlResponse<T> {
  data?: T | null;
  errors?: { message: string }[];
}

/**
 * Run a GraphQL query against graphql.gbif.org. A response with HTTP 200 and an
 * `errors` array (or no data) is usually a transient backend failure: it is retried
 * with backoff, up to `options.retries` times (default 3), and then thrown as a
 * `GbifGraphqlError`. HTTP-level retries happen inside each attempt.
 */
export async function gbifGraphql<T>(
  query: string,
  variables: Record<string, unknown> = {},
  options: FetchOptions = {},
): Promise<T> {
  const retries = options.retries ?? 3;
  for (let attempt = 0; ; attempt++) {
    const response = await postJson<GraphqlResponse<T>>(
      GBIF_GRAPHQL_URL,
      { query, variables },
      options,
    );
    if (!response.errors?.length && response.data) {
      return response.data;
    }
    const error = response.errors?.length
      ? new GbifGraphqlError(response.errors.map((e) => e.message).join('; '))
      : new GbifGraphqlError('Empty response from GBIF GraphQL');
    if (attempt >= retries) {
      throw error;
    }
    await delay(retryDelay(attempt), options.signal);
  }
}
