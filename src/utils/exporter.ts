import { saveAs } from 'file-saver';

export function saveString(
  filename: string,
  content: string,
  type = 'text/plain;charset=utf-8',
) {
  const blob = new Blob([content], { type });
  saveAs(blob, filename);
}
