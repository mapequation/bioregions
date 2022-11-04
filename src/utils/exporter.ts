import { saveAs } from 'file-saver';

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
