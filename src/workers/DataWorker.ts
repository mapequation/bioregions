import { expose } from 'threads/worker';
import { Observable, Subject } from 'threads/observable';
import { ParseAsyncConfig, ParseResult } from 'papaparse';
import { loadFile } from '../utils/loader';

let dataStream = new Subject();

function load(
  file: string | File,
  args: Omit<ParseAsyncConfig<any, File | string>, 'complete'> = {},
) {
  console.log('Loading...');

  return new Promise<string>((resolve) => {
    loadFile(file, {
      complete() {
        dataStream.complete();
        dataStream = new Subject();
        resolve('Loading finished');
      },
      chunk(chunk: ParseResult<any>) {
        dataStream.next(chunk.data);
      },
      ...args,
    });
  });
}

// @ts-ignore
expose({
  load,
  stream() {
    return Observable.from(dataStream);
  },
});
