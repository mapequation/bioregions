import { saveAs } from 'file-saver';

export function saveString(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  saveAs(blob, filename);
}
