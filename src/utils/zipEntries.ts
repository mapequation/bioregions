// Lists the entry names of a zip file from its central directory alone: no entry is
// inflated, so a multi-gigabyte GBIF download costs two small reads.

const EOCD_SIG = 0x06054b50;
const ZIP64_LOCATOR_SIG = 0x07064b50;
const ZIP64_EOCD_SIG = 0x06064b50;
const CD_ENTRY_SIG = 0x02014b50;
const EOCD_SIZE = 22;
/** The EOCD record plus the longest possible archive comment. */
const MAX_TAIL = EOCD_SIZE + 0xffff;
const ZIP64_LOCATOR_SIZE = 20;
const ZIP64_EOCD_SIZE = 56;

export class ZipReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipReadError';
  }
}

async function readRange(blob: Blob, start: number, end: number): Promise<DataView> {
  if (start < 0 || end > blob.size || start > end) {
    throw new ZipReadError('Not a zip file: the central directory lies outside the file');
  }
  return new DataView(await blob.slice(start, end).arrayBuffer());
}

const u64 = (view: DataView, offset: number) => Number(view.getBigUint64(offset, true));

/**
 * The names of the entries in a zip, read from the end-of-central-directory record
 * (searched for in the last 65,557 bytes), the ZIP64 locator when the record's fields
 * overflow, and the central directory. Directory entries (names ending in "/") are
 * left out. Throws `ZipReadError` when the blob is not a readable zip.
 */
export async function listZipEntries(blob: Blob): Promise<string[]> {
  const tailStart = Math.max(0, blob.size - MAX_TAIL);
  const tail = await readRange(blob, tailStart, blob.size);
  let eocd = -1;
  for (let i = tail.byteLength - EOCD_SIZE; i >= 0; i--) {
    if (tail.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    throw new ZipReadError('Not a zip file: no end-of-central-directory record');
  }

  let count = tail.getUint16(eocd + 10, true);
  let cdSize = tail.getUint32(eocd + 12, true);
  let cdOffset = tail.getUint32(eocd + 16, true);

  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    const locatorAt = tailStart + eocd - ZIP64_LOCATOR_SIZE;
    const locator = await readRange(blob, locatorAt, locatorAt + ZIP64_LOCATOR_SIZE);
    if (locator.getUint32(0, true) !== ZIP64_LOCATOR_SIG) {
      throw new ZipReadError('Not a zip file: missing ZIP64 locator');
    }
    const recordAt = u64(locator, 8);
    const record = await readRange(blob, recordAt, recordAt + ZIP64_EOCD_SIZE);
    if (record.getUint32(0, true) !== ZIP64_EOCD_SIG) {
      throw new ZipReadError('Not a zip file: missing ZIP64 end-of-central-directory record');
    }
    count = u64(record, 32);
    cdSize = u64(record, 40);
    cdOffset = u64(record, 48);
  }

  const cd = await readRange(blob, cdOffset, cdOffset + cdSize);
  const utf8 = new TextDecoder('utf-8');
  const names: string[] = [];
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > cd.byteLength || cd.getUint32(p, true) !== CD_ENTRY_SIG) {
      throw new ZipReadError('Not a zip file: corrupt central directory');
    }
    const nameLength = cd.getUint16(p + 28, true);
    const extraLength = cd.getUint16(p + 30, true);
    const commentLength = cd.getUint16(p + 32, true);
    const name = utf8.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLength));
    if (!name.endsWith('/')) {
      names.push(name);
    }
    p += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}
