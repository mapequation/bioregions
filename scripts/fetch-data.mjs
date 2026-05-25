import { existsSync, readFileSync, mkdirSync, mkdtempSync, rmSync } from "fs";
import { execSync } from "child_process";
import { tmpdir } from "os";
import { join, dirname } from "path";

const DATA_REPO = "mapequation/bioregions-data";
const BRANCH = "main";
const DATA_DIR = "public/data";

const examples = JSON.parse(readFileSync("src/examples.json", "utf8"));
const requiredFiles = examples
  .flatMap((e) => [e.speciesFile, e.treeFile].filter(Boolean))
  .map((f) => `public/${f}`);

const missingData = requiredFiles.filter((f) => !existsSync(f));
const populated = missingData.length === 0;

if (populated) {
  console.log("Data already present, skipping fetch.");
} else {
  console.log(`Missing: ${missingData.join(", ")}`);
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
}

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
