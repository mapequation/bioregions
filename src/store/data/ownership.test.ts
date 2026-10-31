// I5: only DataStore (and src/store/data/**) loads or clears SpeciesStore and TreeStore.
// Reads every source file (tests excluded) and fails on a load or clear call outside the
// allowlist, naming file:line.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');
const SRC = join(ROOT, 'src');

const ALLOW: (string | RegExp)[] = [
  'src/store/DataStore.ts',
  /^src\/store\/data\//,
  'src/store/SpeciesStore.ts',
  'src/store/TreeStore.ts',
  // TODO(S2b): ExplorerStore's stream and zip loads move to src/store/data/.
  'src/store/ExplorerStore.ts',
  // TODO(S3): Open Tree loads go through dataStore.loadTree.
  'src/store/PhyloStore.ts',
];

const PATTERNS: RegExp[] = [
  /(speciesStore|treeStore)\??\.(load|loadString|loadShapefile|loadRecords|clearData|reset)\(/,
  // Any receiver, so aliases (`const species = rootStore.speciesStore`) are caught too.
  /\.(loadRecords|loadShapefile)\(/,
  /(?<!this)\.clearData\(/,
  /rootStore\.clearData\(/,
  /\.(lastLoad|loadedTree)\s*=[^=]/,
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const allowed = (file: string) => ALLOW.some((a) => (typeof a === 'string' ? a === file : a.test(file)));

describe('data ownership (I5)', () => {
  it('has no load or clear call outside the allowlist', () => {
    const offending: string[] = [];
    for (const path of sourceFiles(SRC)) {
      const file = relative(ROOT, path).split('\\').join('/');
      if (allowed(file)) continue;
      readFileSync(path, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          const code = line.trim();
          if (code.startsWith('//') || code.startsWith('*')) return;
          if (PATTERNS.some((p) => p.test(code))) offending.push(`${file}:${i + 1}: ${code}`);
        });
    }
    expect(offending).toEqual([]);
  });

  it('catches the alias forms', () => {
    const hits = (code: string) => PATTERNS.some((p) => p.test(code));
    expect(hits('species.loadRecords(batches, {})')).toBe(true);
    expect(hits('await rootStore.speciesStore.load(file)')).toBe(true);
    expect(hits('this.rootStore.clearData();')).toBe(true);
    expect(hits('infomapStore.clearData();')).toBe(true);
    expect(hits('treeStore?.reset()')).toBe(true);
    expect(hits('this.lastLoad = load;')).toBe(true);
    expect(hits('this.clearData();')).toBe(false);
    expect(hits('treeStore.resetView()')).toBe(false);
    expect(hits('if (x.lastLoad === y)')).toBe(false);
  });
});
