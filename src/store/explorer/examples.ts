// Static example studies for the explorer's empty state and library. GBIF backbone
// keys and WoRMS AphiaIDs (OBIS) verified live on 2026-10-30.
import { presetQuality } from '../../sources/query';
import { regionById } from '../../sources/regions';
import type { AreaFilter, BBox, OccurrenceQuery, TaxonRef } from '../../sources/types';
import type { SavedQuery } from './types';

const region = (id: string): AreaFilter => {
  const r = regionById(id);
  return r ? { kind: 'bbox', bbox: r.bbox, label: r.label } : { kind: 'world' };
};

const bbox = (b: BBox, label: string): AreaFilter => ({ kind: 'bbox', bbox: b, label });

function example(
  id: string,
  name: string,
  taxon: TaxonRef,
  area: AreaFilter,
  opts: { years?: OccurrenceQuery['years']; obis?: boolean; specimensOnly?: boolean } = {},
): SavedQuery {
  const quality = presetQuality('recommended');
  if (opts.specimensOnly) quality.basisOfRecord = ['PRESERVED_SPECIMEN', 'MATERIAL_SAMPLE'];
  return {
    id: `example-${id}`,
    name,
    savedAt: '2026-10-30T00:00:00.000Z',
    query: {
      taxa: [taxon],
      area,
      years: opts.years ?? [null, null],
      depth: [null, null],
      quality,
      sources: { gbif: true, obis: opts.obis ?? false },
    },
  };
}

const MAMMALS = 'Animalia › Chordata › Mammalia';

/** Six example studies, small enough to load in a minute or two. */
export function exampleStudies(): SavedQuery[] {
  return [
    example(
      'marmosets',
      'Marmosets & tamarins',
      { name: 'Callitrichidae', rank: 'FAMILY', gbifKey: 9620, vernacularName: 'marmosets and tamarins', path: `${MAMMALS} › Primates` },
      region('realm-neotropic'),
      { years: [1970, 2025] },
    ),
    example(
      'cats',
      'Cats of the world',
      { name: 'Felidae', rank: 'FAMILY', gbifKey: 9703, obisId: 1460004, vernacularName: 'cats', path: `${MAMMALS} › Carnivora` },
      { kind: 'world' },
      { years: [1970, 2025] },
    ),
    example(
      'hummingbirds',
      'Hummingbirds of the Andes',
      {
        name: 'Trochilidae',
        rank: 'FAMILY',
        gbifKey: 5289,
        obisId: 225861,
        vernacularName: 'hummingbirds',
        path: 'Animalia › Chordata › Aves › Apodiformes',
      },
      bbox([-81, -25, -63, 11], 'Andes'),
      // Specimens only: observation records (mostly eBird) number in the millions here.
      { specimensOnly: true },
    ),
    example(
      'oaks',
      'Oaks of North America',
      { name: 'Quercus', rank: 'GENUS', gbifKey: 2877951, vernacularName: 'oaks', path: 'Plantae › Tracheophyta › Magnoliopsida › Fagales › Fagaceae' },
      region('north-america'),
      { specimensOnly: true },
    ),
    example(
      'dolphins',
      'Dolphins of the North Atlantic',
      { name: 'Delphinidae', rank: 'FAMILY', gbifKey: 5314, obisId: 136980, vernacularName: 'dolphins', path: `${MAMMALS} › Cetacea` },
      region('ocean-north-atlantic'),
      { years: [1990, 2025], obis: true },
    ),
    example(
      'corals',
      'Reef-building corals of the Coral Triangle',
      {
        name: 'Scleractinia',
        rank: 'ORDER',
        gbifKey: 714,
        obisId: 1363,
        vernacularName: 'stony corals',
        path: 'Animalia › Cnidaria › Anthozoa',
      },
      bbox([112, -12, 162, 12], 'Coral Triangle'),
      { obis: true },
    ),
  ];
}
