# Fetch-Data Improvements Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two improvements to `scripts/fetch-data.mjs`:
1. Replace the flawed "directory non-empty" check with a proper required-files check, using a shared JSON as the single source of truth for example file paths (consumed by both `ExampleStore.ts` and `fetch-data.mjs`)
2. Download the two world-atlas TopoJSON map files into `public/data/maps/` if missing

**Files changed:**
- Create: `src/examples.json`
- Modify: `src/store/ExampleStore.ts`
- Modify: `scripts/fetch-data.mjs`

---

## Task 1: Extract examples to `src/examples.json`

This becomes the single source of truth for example datasets. Both `ExampleStore.ts` (browser) and `fetch-data.mjs` (Node) read from it.

- [ ] **Step 1: Create `src/examples.json`**

  ```json
  [
    {
      "name": "Demo",
      "speciesFile": "data/demo.csv",
      "treeFile": "data/demo.nwk",
      "size": "140 B",
      "devOnly": true,
      "settings": {
        "minCellSize": 0,
        "maxCellSize": 1,
        "minCellCapacity": 0,
        "maxCellCapacity": 100
      }
    },
    {
      "name": "Sample",
      "speciesFile": "data/head.csv",
      "treeFile": "data/head.nwk",
      "size": "370 B",
      "devOnly": true,
      "settings": {
        "minCellSize": 0,
        "maxCellSize": 1,
        "minCellCapacity": 0,
        "maxCellCapacity": 100
      }
    },
    {
      "name": "Birches",
      "speciesFile": "data/BIRCHES.zip",
      "size": "2.3 MB",
      "devOnly": true,
      "settings": {
        "minCellSize": 0,
        "maxCellSize": 1,
        "minCellCapacity": 0,
        "maxCellCapacity": 100
      }
    },
    {
      "name": "Neotropical mammal occurrences",
      "speciesFile": "data/mammals_neotropics.csv",
      "treeFile": "data/mammals_neotropics.nwk",
      "size": "2.8 MB",
      "settings": {}
    },
    {
      "name": "Global mammal occurrences",
      "speciesFile": "data/mammals_global.tsv",
      "treeFile": "data/mammals_global.nwk",
      "size": "56 MB",
      "settings": { "includeTree": false }
    }
  ]
  ```

  Paths use `data/` relative to the `public/` root (no leading `/bioregions/`). Both consumers add their own prefix.

---

## Task 2: Update `ExampleStore.ts` to use `src/examples.json`

- [ ] **Step 1: Import the JSON and refactor `initExamples()`**

  Replace the hardcoded example objects in `src/store/ExampleStore.ts` with a JSON import. Vite supports JSON imports natively.

  New `initExamples()`:

  ```ts
  import examplesData from '../examples.json';

  // (inside initExamples)
  return examplesData
    .filter(e => !e.devOnly || process.env.NODE_ENV === 'development')
    .map(e => ({
      name: e.name,
      speciesFile: `/bioregions/${e.speciesFile}`,
      treeFile: e.treeFile ? `/bioregions/${e.treeFile}` : undefined,
      size: e.size,
      settings: e.settings,
    }));
  ```

- [ ] **Step 2: Update the `Example` interface** if needed — add optional `devOnly?: boolean` to the interface, or keep it only in the JSON (it's not needed on the runtime object after filtering).

- [ ] **Step 3: Verify the app still renders the correct examples in dev and production modes**

  ```bash
  npm run dev
  ```

  In dev: all 5 examples visible. In a production build preview: only the 2 non-devOnly examples visible.

---

## Task 3: Update `fetch-data.mjs` to read from `src/examples.json`

- [ ] **Step 1: Replace the population check**

  In `scripts/fetch-data.mjs`, replace:

  ```js
  const populated =
    existsSync(DATA_DIR) && readdirSync(DATA_DIR).length > 0;
  ```

  With:

  ```js
  import { readFileSync } from "fs";

  const examples = JSON.parse(readFileSync("src/examples.json", "utf8"));
  const requiredFiles = examples
    .flatMap((e) => [e.speciesFile, e.treeFile].filter(Boolean))
    .map((f) => `public/${f}`);

  const missingData = requiredFiles.filter((f) => !existsSync(f));
  const populated = missingData.length === 0;
  ```

  All example files (including `devOnly`) are checked — local dev needs them all.

  Also remove the now-unused `readdirSync` import.

- [ ] **Step 2: Update the log message to show missing files**

  ```js
  if (!populated) {
    console.log(`Missing: ${missingData.join(", ")}`);
  }
  ```

---

## Task 4: Add map downloads

The app fetches `/bioregions/data/maps/land-110m.json` and `/bioregions/data/maps/land-50m.json` (see `src/store/LandStore.ts`). These are stable CDN assets downloaded directly — they do not need to go into `bioregions-data`.

- [ ] **Step 1: Add `dirname` to path imports in `fetch-data.mjs`**

- [ ] **Step 2: Add map download block after the species data block**

  ```js
  const MAPS = {
    "public/data/maps/land-50m.json":
      "https://cdn.jsdelivr.net/npm/world-atlas@2/land-50m.json",
    "public/data/maps/land-110m.json":
      "https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json",
  };

  for (const [dest, url] of Object.entries(MAPS)) {
    if (!existsSync(dest)) {
      console.log(`Fetching ${dest}...`);
      mkdirSync(dirname(dest), { recursive: true });
      execSync(`curl -fsSL "${url}" -o "${dest}"`, { stdio: "inherit" });
    }
  }
  ```

---

## Task 5: Verify and commit

- [ ] **Step 1: Run script locally**

  ```bash
  node scripts/fetch-data.mjs
  ```

  Expected (all data present, maps absent or present):
  ```
  Data already present, skipping fetch.
  Fetching public/data/maps/land-50m.json...   # if absent
  Fetching public/data/maps/land-110m.json...  # if absent
  ```

- [ ] **Step 2: Test `.DS_Store`-only directory no longer causes false skip**

  ```bash
  mv public/data public/data.bak
  mkdir public/data && touch public/data/.DS_Store
  node scripts/fetch-data.mjs
  # Expected: fetches data (does not print "Data already present")
  rm -rf public/data
  mv public/data.bak public/data
  ```

- [ ] **Step 3: Commit all changes**

  ```bash
  git add src/examples.json src/store/ExampleStore.ts scripts/fetch-data.mjs
  git commit -m "refactor: single source of truth for examples; fix dir check; add map downloads"
  ```

- [ ] **Step 4: Push and confirm CI**

  ```bash
  git push origin main
  ```

  CI log should show:
  ```
  Fetching data from github.com/mapequation/bioregions-data...
  Done.
  Fetching public/data/maps/land-50m.json...
  Fetching public/data/maps/land-110m.json...
  ```
