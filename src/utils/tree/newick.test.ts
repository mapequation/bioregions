import { describe, expect, it } from 'vitest';
import { read } from './newick';
import type { ITree } from './newick';

function names(tree: ITree): string[] {
  return [tree.name, ...tree.children.flatMap(names)];
}

describe('newick read', () => {
  it('parses names, lengths and internal support values', () => {
    const tree = read('(A:0.1,B:0.2,(C:0.3,D:0.4)95:0.5)F;');
    expect(tree.name).toBe('F');
    expect(tree.children.map((c) => c.name)).toEqual(['A', 'B', '']);
    expect(tree.children.map((c) => c.branchLength)).toEqual([0.1, 0.2, 0.5]);
    expect(tree.children[2].bs).toBe(95);
    expect(tree.children[2].children.map((c) => c.name)).toEqual(['C', 'D']);
  });

  it('keeps quoted labels, with doubled single quotes as escapes', () => {
    const tree = read(
      `('Homo sapiens':1,"Pan troglodytes":1,'O''Brien''s rat':1)'Hominini 1':2;`,
    );
    expect(names(tree)).toEqual([
      'Hominini 1',
      'Homo sapiens',
      'Pan troglodytes',
      "O'Brien's rat",
    ]);
    expect(tree.children.map((c) => c.branchLength)).toEqual([1, 1, 1]);
  });

  it('keeps a quoted numeric internal label as a name', () => {
    const tree = read(`((a,b)'42',c);`);
    expect(tree.children[0].name).toBe('42');
    expect(tree.children[0].bs).toBeUndefined();
  });

  it('keeps numeric tip labels as names', () => {
    const tree = read('((1:1,2:1)90:1,3:2);');
    expect(names(tree)).toEqual(['', '', '1', '2', '3']);
    expect(tree.children[0].bs).toBe(90);
  });

  it('skips [...] comments', () => {
    const tree = read('[&R] (a[&rate=1]:1,b:[c,d]2)[x];');
    expect(names(tree)).toEqual(['', 'a', 'b']);
    expect(tree.children.map((c) => c.branchLength)).toEqual([1, 2]);
  });

  it('stops at the first semicolon', () => {
    const tree = read('(a:1,b:1);\n(c:1,d:1);\n');
    expect(names(tree)).toEqual(['', 'a', 'b']);
  });

  it('accepts whitespace and newlines between tokens', () => {
    const tree = read(' ( a : 1 ,\n b : 2 ) root ; ');
    expect(names(tree)).toEqual(['root', 'a', 'b']);
    expect(tree.children.map((c) => c.branchLength)).toEqual([1, 2]);
  });

  it('rejects a stray opening parenthesis instead of overwriting children', () => {
    expect(() => read('(a,b)(c,d);')).toThrow(/unexpected '\('/);
  });

  it('rejects unbalanced parentheses', () => {
    expect(() => read('((a,b);')).toThrow(/unbalanced/);
    expect(() => read('(a,b));')).toThrow(/unbalanced/);
  });
});
