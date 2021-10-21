import { expose } from 'threads/worker';
import { Observable, Subject } from 'threads/observable';
import { ParseResult } from 'papaparse';
import { loadFile } from '../utils/loader';

let dataStream = new Subject();

function load(filename: string) {
  console.log('load...');

  const papaArgs = {
    complete() {
      dataStream.complete();
      dataStream = new Subject();
    },
    chunk(chunk: ParseResult<any>) {
      dataStream.next(chunk.data);
    },
  };

  loadFile(filename, papaArgs);

  return 'load finished';
}

// @ts-ignore
expose({
  load,
  stream() {
    return Observable.from(dataStream);
  },
});
