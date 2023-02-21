import { saveAs } from 'file-saver';
// import { Buffer } from "buffer";

export function base64toData(content: string) {
  // const binary = Buffer.from(content, 'base64');
  const binary = atob(content);
  let array: number[] = [];
  for (let i = 0; i < binary.length; i++) {
    // array.push(binary.at(i) as number);
    array.push(binary.charCodeAt(i) as number);
  }
  return new Uint8Array(array);
}

export function saveBlob(filename: string, blob: Blob) {
  saveAs(blob, filename);
}

export function saveBase64(filename: string, content: string, type: string) {
  const data = base64toData(content);
  const blob = new Blob([data], { type });
  saveAs(blob, filename);
}

export function saveString(
  filename: string,
  content: string,
  type = 'text/plain;charset=utf-8',
) {
  const blob = new Blob([content], { type });
  saveAs(blob, filename);
}

export function saveSvg(
  filename: string,
  content: string,
  type = 'image/svg+xml;charset=utf-8',
) {
  const blob = new Blob([content], { type });
  saveAs(blob, filename);
}

export async function saveCanvas(canvas: HTMLCanvasElement, filename?: string) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob: Blob | null) => {
      if (blob == null) {
        return reject(`Can't save canvas to image`);
      }
      if (filename) {
        saveAs(blob, filename);
      }
      resolve(blob);
    });
  });
}
