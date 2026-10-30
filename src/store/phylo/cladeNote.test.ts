import { describe, expect, it } from 'vitest';
import { cladeNameNote } from './cladeNote';

describe('cladeNameNote', () => {
  it('names a rank change of the same group', () => {
    expect(cladeNameNote([{ name: 'Callitrichidae', rank: 'FAMILY' }], { name: 'Callitrichinae', rank: 'subfamily' })).toBe(
      'Open Tree treats Callitrichidae as the subfamily Callitrichinae; same group, different rank.',
    );
  });

  it('names a different clade, and stays silent when names agree or the query is not one higher taxon', () => {
    expect(cladeNameNote([{ name: 'Felidae', rank: 'FAMILY' }], { name: 'Pantherinae', rank: 'subfamily' })).toBe(
      'The smallest Open Tree clade with all your matched species is Pantherinae (subfamily), not Felidae (family).',
    );
    expect(cladeNameNote([{ name: 'Felidae', rank: 'FAMILY' }], { name: 'Felidae', rank: 'family' })).toBeNull();
    expect(cladeNameNote([{ name: 'Puma concolor', rank: 'SPECIES' }], { name: 'Puma', rank: 'genus' })).toBeNull();
    expect(
      cladeNameNote(
        [
          { name: 'Felidae', rank: 'FAMILY' },
          { name: 'Canidae', rank: 'FAMILY' },
        ],
        { name: 'Carnivora', rank: 'order' },
      ),
    ).toBeNull();
  });
});
