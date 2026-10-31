import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { classifyFiles, type FileInfo, inspectFiles, UPLOAD_COPY } from './classify';

const f = (name: string, zipEntries?: string[]): FileInfo => ({ name, size: 100, ...(zipEntries ? { zipEntries } : {}) });

describe('classifyFiles', () => {
  it('reports no files', () => {
    expect(classifyFiles([]).errors).toEqual([UPLOAD_COPY.noFiles]);
  });

  it.each([
    ['birds.csv', 'csv'],
    ['birds.TSV', 'tsv'],
  ] as const)('reads %s as points', (name, format) => {
    expect(classifyFiles([f(name)])).toEqual({
      occurrences: { kind: 'points', format, file: 0 },
      tree: null,
      ignored: [],
      errors: [],
    });
  });

  it.each(['birds.nwk', 'birds.tre', 'birds.TREE'])('reads %s as a tree', (name) => {
    const plan = classifyFiles([f(name)]);
    expect(plan.tree).toEqual({ kind: 'tree', file: 0 });
    expect(plan.occurrences).toBeNull();
    expect(plan.errors).toEqual([]);
  });

  it('pairs a loose .shp with its .dbf, .shx and .prj', () => {
    const plan = classifyFiles([f('r.shp'), f('r.dbf'), f('r.shx'), f('r.prj')]);
    expect(plan.occurrences).toEqual({ kind: 'shapefile', files: [0, 1, 2, 3] });
    expect(plan.errors).toEqual([]);
  });

  it('needs the .dbf with a loose .shp', () => {
    const plan = classifyFiles([f('r.shp'), f('r.shx')]);
    expect(plan.occurrences).toBeNull();
    expect(plan.errors).toEqual([UPLOAD_COPY.noDbf]);
  });

  it('needs the .shp with a loose .dbf', () => {
    const plan = classifyFiles([f('r.dbf')]);
    expect(plan.occurrences).toBeNull();
    expect(plan.errors).toEqual([UPLOAD_COPY.noShp]);
  });

  it('reads a zip with occurrence.txt at its root as a Darwin Core Archive', () => {
    const plan = classifyFiles([f('0012345-241007104925546.zip', ['occurrence.txt', 'meta.xml', 'dataset/x.xml'])]);
    expect(plan.occurrences).toEqual({ kind: 'gbif-zip', file: 0, format: 'DWCA', downloadKey: '0012345-241007104925546' });
  });

  it('reads a zip with <download key>.csv at its root as a Simple CSV download', () => {
    const plan = classifyFiles([f('download.zip', ['0012345-241007104925546.csv'])]);
    expect(plan.occurrences).toEqual({
      kind: 'gbif-zip',
      file: 0,
      format: 'SIMPLE_CSV',
      downloadKey: '0012345-241007104925546',
    });
  });

  it('rejects a zipped CSV that is not a GBIF download', () => {
    const plan = classifyFiles([f('mine.zip', ['data.csv'])]);
    expect(plan.occurrences).toBeNull();
    expect(plan.errors).toEqual([UPLOAD_COPY.notGbif]);
  });

  it('reads a zip with one nested .shp as a shapefile', () => {
    const plan = classifyFiles([f('ranges.zip', ['ranges/r.shp', 'ranges/r.dbf', '__MACOSX/ranges/._r.shp'])]);
    expect(plan.occurrences).toEqual({ kind: 'shapefile-zip', file: 0 });
    expect(plan.errors).toEqual([]);
  });

  it('rejects a zip with two shapefiles', () => {
    const plan = classifyFiles([f('ranges.zip', ['a.shp', 'a.dbf', 'b.shp', 'b.dbf'])]);
    expect(plan.occurrences).toBeNull();
    expect(plan.errors).toEqual([UPLOAD_COPY.manyShapefiles(2)]);
  });

  it('reports a zip it could not read', () => {
    expect(classifyFiles([f('broken.zip')]).errors).toEqual([UPLOAD_COPY.unreadableZip('broken.zip')]);
  });

  it('takes one occurrence file and one tree together', () => {
    const plan = classifyFiles([f('birds.csv'), f('birds.nwk')]);
    expect(plan.occurrences).toEqual({ kind: 'points', format: 'csv', file: 0 });
    expect(plan.tree).toEqual({ kind: 'tree', file: 1 });
    expect(plan.errors).toEqual([]);
  });

  it('rejects two occurrence files', () => {
    const plan = classifyFiles([f('a.csv'), f('b.csv')]);
    expect(plan.occurrences).toBeNull();
    expect(plan.errors).toEqual(['Drop one occurrence file at a time (found a.csv, b.csv)']);
  });

  it('rejects two trees', () => {
    const plan = classifyFiles([f('a.nwk'), f('b.tre')]);
    expect(plan.tree).toBeNull();
    expect(plan.errors).toEqual([UPLOAD_COPY.manyTrees]);
  });

  it('ignores unsupported files', () => {
    const plan = classifyFiles([f('birds.xlsx'), f('birds.csv')]);
    expect(plan.ignored).toEqual([
      { name: 'birds.xlsx', reason: 'birds.xlsx: unsupported file type .xlsx (see the supported formats)' },
    ]);
    expect(plan.occurrences).toEqual({ kind: 'points', format: 'csv', file: 1 });
    expect(plan.errors).toEqual([]);
  });
});

describe('inspectFiles', () => {
  it('lists zip entries and leaves other files alone', async () => {
    const zip = zipSync({ 'occurrence.txt': strToU8('x') });
    const files = [
      new File([zip as BlobPart], 'gbif.zip'),
      new File(['species,lat,long\n'], 'birds.csv'),
      new File(['not a zip'], 'broken.zip'),
    ];
    const infos = await inspectFiles(files);
    expect(infos[0].zipEntries).toEqual(['occurrence.txt']);
    expect(infos[1]).toEqual({ name: 'birds.csv', size: 17 });
    expect(infos[2].zipEntries).toBeUndefined();
    expect(classifyFiles(infos).errors).toContain(UPLOAD_COPY.unreadableZip('broken.zip'));
  });
});
