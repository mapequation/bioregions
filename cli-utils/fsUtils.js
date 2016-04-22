import fsp from 'fs-promise';

export function readFile(path, enc = 'utf8') {
  return fsp.realpath(path)
    .then(resolvedPath => {
      return fsp.readFile(resolvedPath, enc);
    })
}

/**
 * Create a write stream.
 * Add .on('finish', resolve), and call .end() when done writing.
 * @param path:String The file system path to write the output
 * @return out:WriteStream. Write with out.write('something\n');
 */
export function promiseWriteStream(path) {
  return new Promise((resolve, reject) => {
    let out = fsp.createWriteStream(path);
    out.on('error', reject);
    out.on('open', () => {
      resolve(out);
    })
  });

}
