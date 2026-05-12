
/**
 * Get name from filename by removing
 * optional path and extension
 * "[/public/data/]name[.ext]"
 */
export function getName(filename: string) {
  const name = basename(filename)
    .split('.').slice(0, -1).join('.'); // remove extension
  return name;
}


export function extension(filename: string): string {
  return filename.split('.').pop() ?? "";
}

export function basename(filename: string) {
  return filename.split('/').reverse()[0];
}