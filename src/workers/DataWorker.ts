import { expose } from 'threads/worker';
import { Observable, Subject } from 'threads/observable';
import Papa, { ParseConfig, ParseResult, ParseError } from 'papaparse';

let dataStream = new Subject();

function loadFile(url: string, papaArgs: ParseConfig = {}) {
  Papa.parse(url, {
    download: true,
    dynamicTyping: true,
    header: true,
    worker: false,
    ...papaArgs,
  });
}

function preview(url: string, papaArgs: ParseConfig = {}) {
  loadFile(url, {
    preview: 10,
    ...papaArgs,
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function loadPreview() {
  const data: Array<any> = [];
  const errors: ParseError[] = [];
  return new Promise<any>((resolve, reject) => {
    preview('/data/mammals_neotropics.csv', {
      complete() {
        console.log('Complete!');
        if (errors.length > 0) {
          return reject(errors);
        }
        resolve(data);
      },
      chunk(chunk: ParseResult<any>) {
        console.log('chunk:', chunk);
        data.push(...chunk.data);
        errors.push(...chunk.errors);
      },
    });
  });
}

function loadSample() {
  console.log('loadSample...');

  loadFile('/data/mammals_neotropics.csv', {
    //preview: 500,
    complete() {
      dataStream.complete();
      dataStream = new Subject();
    },
    chunk(chunk: ParseResult<any>) {
      dataStream.next(chunk.data);
    },
  });

  return 'loadSample finished';
}

// @ts-ignore
expose({
  loadFile,
  loadPreview,
  preview,
  loadSample,
  stream() {
    return Observable.from(dataStream);
  },
});
