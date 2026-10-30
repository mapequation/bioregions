import { describe, expect, it, vi } from 'vitest';
import { HttpError } from '../../sources/http';
import { CHECKLISTBANK_TAXON_URL, resolveTaxonNames, unknownTaxonLabel } from './taxonNames';

describe('resolveTaxonNames', () => {
  it('asks GBIF for numeric keys and ChecklistBank for the rest, with a fallback', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url.endsWith('/species/9620')) return { canonicalName: 'Callitrichidae' };
      if (url === `${CHECKLISTBANK_TAXON_URL}/935Y2`) return { name: { scientificName: 'Helleborus torquatus' } };
      // GBIF does not know 123; ChecklistBank names it.
      if (url.endsWith('/species/123')) throw new HttpError(404, '', url);
      if (url === `${CHECKLISTBANK_TAXON_URL}/123`) return { name: { scientificName: 'Aa bb' } };
      throw new HttpError(404, '', url);
    });
    const names = await resolveTaxonNames(['9620', '935Y2', '123', 'ZZZZ'], undefined, fetch as never);
    expect(Object.fromEntries(names)).toEqual({
      '9620': 'Callitrichidae',
      '935Y2': 'Helleborus torquatus',
      '123': 'Aa bb',
      ZZZZ: 'unknown taxon (key ZZZZ)',
    });
    // Alphanumeric keys never reach the GBIF species API (it answers 400).
    expect(fetch.mock.calls.some(([u]) => String(u).includes('api.gbif.org') && String(u).includes('935Y2'))).toBe(false);
  });

  it('labels unknown keys plainly', () => {
    expect(unknownTaxonLabel('935Y2')).toBe('unknown taxon (key 935Y2)');
  });
});
