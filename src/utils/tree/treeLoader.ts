import * as newickReader from './newick';
import type { ITree } from './newick';
export type { ITree } from './newick';

export function parseTree(str: string) {
    return newickReader.read(str);
}

export function loadTree(file: File | string): Promise<ITree> {
    if (typeof file === 'string') {
        return new Promise<ITree>(resolve =>
            fetch(file)
                .then(res => res.text())
                .then(text => parseTree(text))
                .then(resolve));
    }

    const reader = new FileReader();
    return new Promise<ITree>((resolve, reject) => {
        reader.onload = () =>
            resolve(parseTree(reader.result as string));
        reader.onerror = reject;
        reader.readAsText(file);
    });
}
