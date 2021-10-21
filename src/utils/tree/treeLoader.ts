import * as newickReader from './newick';
import { loadText } from '../loader';
import type { ITree } from './newick';
export type { ITree } from './newick';

export function parseTree(str: string) {
    return newickReader.read(str);
}

export async function loadTree(file: File | string): Promise<ITree> {
    return parseTree(await loadText(file));
}
