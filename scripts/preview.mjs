// Render every fixture in tests/fixtures/*.json into docs/preview/ for review.
// Usage: FONT_DIR=.fonts node scripts/preview.mjs
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "./render-tanka.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = path.join(root, "tests/fixtures");

for (const file of (await readdir(fixtures)).filter((f) => f.endsWith(".json")).sort()) {
  const name = path.basename(file, ".json");
  process.env.FIXTURE = path.join(fixtures, file);
  process.env.OUT_DIR = path.join(root, "docs/preview", name);
  console.log(`--- ${name}`);
  await main();
}
