import Papa, {
  ParseLocalConfig,
  ParseRemoteConfig,
  ParseResult,
  ParseError,
} from 'papaparse';

export type ParseAsyncConfig<T = any, TInput = undefined> = ParseLocalConfig<T, TInput> | ParseRemoteConfig<T>;

function loadLocalFile<T = any>(
  file: File,
  args: ParseLocalConfig<T, File> = { complete: () => { } },
) {
  Papa.parse<T, File>(file, {
    dynamicTyping: true,
    header: true,
    chunkSize: 1024 * 1024, // 1 MB
    worker: false,
    skipEmptyLines: true,
    ...args,
  });
}

function loadRemoteFile<T = any>(
  url: string,
  args: Omit<ParseRemoteConfig<T>, 'download'> = { complete: () => { } },
) {
  //@ts-ignore
  Papa.parse<T, string>(url, {
    download: true,
    dynamicTyping: true,
    header: true,
    chunkSize: 1024 * 1024, // 1 MB
    worker: false,
    skipEmptyLines: true,
    ...args,
  });
}

export function loadFile(
  file: string | File,
  args: ParseAsyncConfig<any, File | string> = { complete: () => { } },
) {
  if (typeof file === 'string') {
    loadRemoteFile(file, args as ParseRemoteConfig<any>);
  } else {
    loadLocalFile(file, args as ParseLocalConfig<any, File>);
  }
}

export function preview(
  file: string | File,
  args: ParseAsyncConfig<any, File | string> = { complete: () => { } },
) {
  loadFile(file, {
    preview: 10,
    ...args,
  });
}

export function loadPreview(
  file: string | File,
  args: Omit<ParseAsyncConfig<any, File | string>, 'complete'> = {},
) {
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
  if (typeof file === 'string') {
    return fetch(file).then((res) => res.text());
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
