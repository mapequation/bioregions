import Papa, { ParseConfig, ParseResult, ParseError } from 'papaparse';

export function loadFile(file: string | File, args: ParseConfig = {}) {
  Papa.parse(file, {
    download: typeof file === 'string',
    dynamicTyping: true,
    header: true,
    chunkSize: 1024 * 1024, // 1 MB
    worker: false,
    skipEmptyLines: true,
    ...args,
  });
}

export function preview(file: string | File, args: ParseConfig = {}) {
  loadFile(file, {
    preview: 10,
    ...args,
  });
}

export function loadPreview(file: string | File, args: ParseConfig = {}) {
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
      ...args,
    });
  });
}

export async function loadText(file: string | File) {
  if (typeof file === "string") {
    return fetch(file).then(res => res.text());
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as string);
    }
    reader.onerror = reject;
    reader.readAsText(file);
  });
}