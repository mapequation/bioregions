# Data Repo Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** All files under `public/data/` are served from the dedicated repo `mapequation/bioregions-data`. A fetch script downloads them on-demand — both locally and in GitHub Actions CI. Nothing in `public/data/` is ever committed to the main repo.

**Architecture:** A `prebuild` npm lifecycle hook (`scripts/fetch-data.mjs`) checks whether `public/data/` is already populated; if not, it downloads the data repo tarball from GitHub and extracts the `data/` subfolder into `public/data/`. Because npm automatically runs `prebuild` before `npm run build`, the GitHub Actions workflow needs no changes.

**Data repo layout:** `mapequation/bioregions-data` stores files under a `data/` subfolder (next to `README.md`). The repo already exists and contains the current data files.

**Tech Stack:** Node.js built-ins (`fs`, `child_process`), `curl`, `tar` (available on macOS and Linux CI)

---

## Current State

| Item | Status |
|---|---|
| `public/data/` | Gitignored via `/public/data` in `.gitignore` — no change needed |
| `mapequation/bioregions-data` | ✅ Created; data files committed under `data/` subfolder |
| `scripts/fetch-data.mjs` | Does not exist yet |
| `package.json` `prebuild` script | Does not exist yet |

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `scripts/fetch-data.mjs` | Download + extract data tarball if `public/data/` is absent or empty |
| Modify | `package.json` | Add `prebuild` and `fetch-data` npm scripts |

The `.gitignore` and GitHub Actions workflow (`pages.yml`) need **no changes**.

---

## Task 1: Create `scripts/fetch-data.mjs`

**Files:**
- Create: `scripts/fetch-data.mjs`

- [ ] **Step 1: Create the scripts directory**

  ```bash
  mkdir -p scripts
  ```

- [ ] **Step 2: Write the fetch script**

  Create `scripts/fetch-data.mjs`:

  ```js
  import { existsSync, readdirSync, mkdirSync } from "fs";
  import { execSync } from "child_process";
  import { mkdtempSync, rmSync } from "fs";
  import { tmpdir } from "os";
  import { join } from "path";

  const DATA_REPO = "mapequation/bioregions-data";
  const BRANCH = "main";
  const DATA_DIR = "public/data";

  const populated =
    existsSync(DATA_DIR) && readdirSync(DATA_DIR).length > 0;

  if (populated) {
    console.log("Data already present, skipping fetch.");
    process.exit(0);
  }

  console.log(`Fetching data from github.com/${DATA_REPO}...`);
  mkdirSync(DATA_DIR, { recursive: true });

  const tarUrl = `https://codeload.github.com/${DATA_REPO}/tar.gz/refs/heads/${BRANCH}`;
  const tmp = mkdtempSync(join(tmpdir(), "bioregions-data-"));

  try {
    execSync(`curl -fsSL "${tarUrl}" | tar -xz --strip-components=1 -C "${tmp}"`, {
      stdio: "inherit",
    });
    execSync(`cp -r "${join(tmp, "data")}/." "${DATA_DIR}"`, {
      stdio: "inherit",
    });
    console.log("Done.");
  } catch (err) {
    console.error("Failed to fetch data:", err.message);
    process.exit(1);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  ```

  The script downloads the tarball, strips the top-level repo directory (`bioregions-data-main/`) into a temp dir, then copies the contents of `data/` into `public/data/`. The temp dir is always cleaned up.

- [ ] **Step 3: Verify the script runs without error on a clean state**

  Rename existing data to simulate a clean clone:
  ```bash
  mv public/data public/data.bak
  ```

  Run the script:
  ```bash
  node scripts/fetch-data.mjs
  ```

  Expected output:
  ```
  Fetching data from github.com/mapequation/bioregions-data...
  Done.
  ```

  Verify files arrived:
  ```bash
  ls public/data/
  ```

  Expected: same files as in `public/data.bak/`.

- [ ] **Step 4: Verify idempotency (already-present case)**

  Run the script again:
  ```bash
  node scripts/fetch-data.mjs
  ```

  Expected output:
  ```
  Data already present, skipping fetch.
  ```

  Expected exit code: 0

- [ ] **Step 5: Remove the backup**

  ```bash
  rm -rf public/data.bak
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add scripts/fetch-data.mjs
  git commit -m "feat: add fetch-data script to download public/data from bioregions-data repo"
  ```

---

## Task 2: Wire the script into npm scripts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add `prebuild` and `fetch-data` scripts**

  In `package.json`, add to the `scripts` block:

  ```json
  "prebuild": "node scripts/fetch-data.mjs",
  "fetch-data": "node scripts/fetch-data.mjs",
  ```

  `prebuild` runs automatically before `npm run build`. `fetch-data` lets developers fetch data explicitly without triggering the full build.

- [ ] **Step 2: Verify `prebuild` fires during build**

  Remove data to force a fetch:
  ```bash
  rm -rf public/data
  npm run build
  ```

  Expected: fetch script output appears before the TypeScript/Vite build output, then the normal build completes.

- [ ] **Step 3: Commit**

  ```bash
  git add package.json
  git commit -m "feat: add prebuild hook to auto-fetch public/data before build"
  ```

---

## Task 3: Verify GitHub Actions builds correctly

**Files:** no changes — `pages.yml` is unchanged

- [ ] **Step 1: Push and observe the CI run**

  ```bash
  git push origin main
  ```

  Open https://github.com/mapequation/bioregions/actions and watch the **Deploy to GitHub Pages** run.

- [ ] **Step 2: Confirm the fetch step appears in the build log**

  In the `Run npm run build` step, the log should start with:
  ```
  Fetching data from github.com/mapequation/bioregions-data...
  Done.
  ```
  followed by the normal TypeScript + Vite output.

- [ ] **Step 3: Confirm the deployed site loads data**

  Open the deployed GitHub Pages URL and load both example datasets ("Neotropical mammal occurrences" and "Global mammal occurrences"). Verify both render correctly.

---

## Self-Review

**Spec coverage:**
- ✅ All `public/data/` files sourced from `mapequation/bioregions-data` — Tasks 1–3
- ✅ Nothing in `public/data/` committed to main repo — `.gitignore` unchanged
- ✅ Works locally (idempotent, skips if data present) — Task 1 Steps 3–4
- ✅ Works in GitHub Actions — Task 2 (`prebuild`) + Task 3

**Edge cases handled:**
- Script is idempotent (skips if `public/data/` is non-empty)
- `public/data` created if missing (`mkdirSync` with `recursive: true`)
- Temp dir always cleaned up in `finally` block
- Non-zero exit on curl/tar failure so CI fails loudly

**Not covered (intentional):**
- Version pinning: the script always fetches `main`. To pin to a specific data version, change `BRANCH` to a tag name. Not needed now.
- Selective download: the full tarball is always fetched. If the data repo grows very large, individual file downloads could be added later.
- Windows native support: `curl` and `tar` are available on Windows 10+ and in Git for Windows.
