// Generate the synthetic test photos (gradients only, no real photographs).
// Usage: node tests/fixtures/make-images.mjs
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const dir = path.dirname(fileURLToPath(import.meta.url));

function scene(w, h) {
  const horizon = Math.round(h * 0.72);
  const sun = Math.round(Math.min(w, h) * 0.08);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5D6E96"/><stop offset="0.55" stop-color="#B9A3B8"/><stop offset="1" stop-color="#E9A86F"/></linearGradient>
<linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2B3557"/><stop offset="1" stop-color="#4D5F87"/></linearGradient>
</defs>
<rect width="${w}" height="${horizon}" fill="url(#sky)"/>
<circle cx="${w / 2}" cy="${horizon - sun * 0.4}" r="${sun}" fill="#F6D8A6"/>
<rect y="${horizon}" width="${w}" height="${h - horizon}" fill="url(#sea)"/>
<rect x="${w / 2 - sun * 0.6}" y="${horizon + sun * 0.5}" width="${sun * 1.2}" height="${Math.max(2, h / 200)}" fill="#E9C391"/>
<rect x="${w / 2 - sun * 0.3}" y="${horizon + sun * 1.1}" width="${sun * 0.6}" height="${Math.max(2, h / 200)}" fill="#D9B386"/>
</svg>`;
}

for (const [name, w, h] of [
  ["landscape.png", 900, 600],
  ["portrait.png", 600, 900],
]) {
  const png = new Resvg(scene(w, h)).render().asPng();
  await writeFile(path.join(dir, name), png);
  console.log(`wrote ${name} (${png.length} bytes)`);
}
