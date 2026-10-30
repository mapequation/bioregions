import { postJson, type FetchOptions } from '../http';

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

/** Run a GraphQL query against graphql.gbif.org; GraphQL `errors` become a thrown error. */
export async function gbifGraphql<T>(
  query: string,
  variables: Record<string, unknown> = {},
  options: FetchOptions = {},
): Promise<T> {
  const response = await postJson<GraphqlResponse<T>>(
    GBIF_GRAPHQL_URL,
    { query, variables },
    options,
  );
  if (response.errors?.length) {
    throw new GbifGraphqlError(response.errors.map((e) => e.message).join('; '));
  }
  if (!response.data) {
    throw new GbifGraphqlError('Empty response from GBIF GraphQL');
  }
  return response.data;
}
