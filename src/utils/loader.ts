import Papa, { ParseConfig, ParseResult, ParseError } from 'papaparse';

export function loadFile(file: string | File, papaArgs: ParseConfig = {}) {
  Papa.parse(file, {
    download: true,
    dynamicTyping: true,
    header: true,
    chunkSize: 1024 * 1024, // 1 MB
    worker: false,
    skipEmptyLines: true,
    ...papaArgs,
  });
}

export function preview(file: string | File, papaArgs: ParseConfig = {}) {
  loadFile(file, {
    preview: 10,
    ...papaArgs,
  });
}

export function loadPreview(file: string | File) {
  const data: Array<any> = [];
  const errors: ParseError[] = [];
  let header: string[] = [];

  return new Promise<any>((resolve, reject) => {
    preview(file, {
      complete() {
        if (errors.length > 0) {
          return reject(errors);
        }
        resolve({ data, header });
      },
      chunk(chunk: ParseResult<any>) {
        if (chunk.meta.fields) {
          header = chunk.meta.fields;
        }
        data.push(...chunk.data);
        errors.push(...chunk.errors);
      },
    });
  });
}