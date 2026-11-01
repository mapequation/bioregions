import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { listZipEntries, ZipReadError } from './zipEntries';

const blob = (bytes: Uint8Array) => new Blob([bytes as BlobPart]);

/** Rewrites a plain zip's end record into ZIP64 form (fflate writes no ZIP64). */
function toZip64(zip: Uint8Array): Uint8Array {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const eocd = zip.byteLength - 22; // fflate writes no archive comment
  const count = view.getUint16(eocd + 10, true);
  const cdSize = view.getUint32(eocd + 12, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  const out = new Uint8Array(eocd + 56 + 20 + 22);
  out.set(zip.subarray(0, eocd));
  const v = new DataView(out.buffer);
  const record = eocd;
  v.setUint32(record, 0x06064b50, true);
  v.setBigUint64(record + 4, 44n, true);
  v.setBigUint64(record + 24, BigInt(count), true);
  v.setBigUint64(record + 32, BigInt(count), true);
  v.setBigUint64(record + 40, BigInt(cdSize), true);
  v.setBigUint64(record + 48, BigInt(cdOffset), true);
  const locator = record + 56;
  v.setUint32(locator, 0x07064b50, true);
  v.setBigUint64(locator + 8, BigInt(record), true);
  v.setUint32(locator + 16, 1, true);
  const end = locator + 20;
  v.setUint32(end, 0x06054b50, true);
  v.setUint16(end + 8, 0xffff, true);
  v.setUint16(end + 10, 0xffff, true);
  v.setUint32(end + 12, 0xffffffff, true);
  v.setUint32(end + 16, 0xffffffff, true);
  return out;
}

describe('listZipEntries', () => {
  it('lists file entries, leaving out directories', async () => {
    const zip = zipSync({
      'occurrence.txt': strToU8('gbifID\tspecies\n1\tA b\n'),
      'meta.xml': strToU8('<archive/>'),
      'dataset/': {},
      'dataset/a.xml': strToU8('<eml/>'),
    });
    expect(await listZipEntries(blob(zip))).toEqual(['occurrence.txt', 'meta.xml', 'dataset/a.xml']);
  });

  it('keeps UTF-8 names', async () => {
    const zip = zipSync({ 'björk/ranges.shp': new Uint8Array(4) });
    expect(await listZipEntries(blob(zip))).toEqual(['björk/ranges.shp']);
  });

  it('finds the end record behind an archive comment', async () => {
    const zip = zipSync({ 'a.csv': strToU8('x') }, { comment: 'z'.repeat(1000) });
    expect(await listZipEntries(blob(zip))).toEqual(['a.csv']);
  });

  it('reads the ZIP64 end record', async () => {
    const zip = toZip64(zipSync({ 'a.shp': new Uint8Array(8), 'a.dbf': new Uint8Array(8) }));
    expect(await listZipEntries(blob(zip))).toEqual(['a.shp', 'a.dbf']);
  });

  it('lists an empty zip', async () => {
    expect(await listZipEntries(blob(zipSync({})))).toEqual([]);
  });

  it('rejects a file that is not a zip', async () => {
    await expect(listZipEntries(blob(strToU8('species,lat,long\n')))).rejects.toBeInstanceOf(ZipReadError);
  });
});
