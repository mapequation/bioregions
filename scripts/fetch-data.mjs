import { existsSync, readdirSync, mkdirSync, mkdtempSync, rmSync } from "fs";
import { execSync } from "child_process";
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
