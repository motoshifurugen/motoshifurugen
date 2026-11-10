// Draw "today's tanka" from cocoa-he.art into tanka-light.png / tanka-dark.png.
//
// Data: GET $TODAY_URL (default https://cocoa-he.art/today.json)
//   {"date":"2026-11-10","lines":["...","..."],"image":{"url":"https://...","width":1200,"height":800,"alt":"..."},"url":"https://..."}
// When the data is missing (404, network error, unexpected shape, bad image) the
// script logs the reason and exits 0 without writing anything, so the images
// from the previous day stay on the output branch.
//
// Env:
//   TODAY_URL  data endpoint
//   FIXTURE    path to a local today.json (image.url may be a path relative to it)
//   FONT_DIR   directory with NotoSerifJP-Medium.otf and NotoSansJP-Regular.otf
//   OUT_DIR    where to write the PNG files (default: out)

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Resvg } from "@resvg/resvg-js";

export const W = 880;
export const H = 440;
const PHOTO = { x: 40, y: 40, w: 540, h: 360 };
const COL_RIGHT = 805; // right edge of the first (rightmost) column
const COL_TOP = 56;
const COL_BOTTOM = 400; // same as the photo's bottom edge
const COL_MIN_LEFT = 604; // keep clear of the photo
const DATE = { size: 14, baseline: 381, top: 366, width: 86 };

export const THEMES = {
  light: { paper: "#FAF8F3", ink: "#1F2328", muted: "#59636E" },
  dark: { paper: "#161B22", ink: "#E6EDF3", muted: "#9198A1" },
};

const SERIF = "Noto Serif JP";
const SANS = "Noto Sans JP";

// Characters drawn rotated by 90 degrees in a vertical column.
const ROTATE = new Set([..."ー〜～…‥―－—–-~=＝（）()「」『』【】〔〕［］[]｛｝{}〈〉《》<>＜＞:：;；|｜→←"]);
// Punctuation that sits in the upper right of the cell in vertical text.
const CORNER = new Set([..."。、，．,."]);
// Small kana: nudge slightly up and to the right.
const SMALL = new Set([..."ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶㇰㇱㇲㇳㇴㇵㇶㇷㇸㇹㇺㇻㇼㇽㇾㇿ"]);

class DataError extends Error {}

const esc = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);

export function validate(data) {
  if (!data || typeof data !== "object") throw new DataError("response is not a JSON object");
  if (data.error) throw new DataError(`endpoint returned error: ${String(data.error)}`);
  if (typeof data.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data.date))
    throw new DataError("date is missing or not YYYY-MM-DD");
  if (!Array.isArray(data.lines) || data.lines.length < 1 || data.lines.length > 5)
    throw new DataError("lines must be an array of 1 to 5 strings");
  for (const l of data.lines) {
    if (typeof l !== "string" || l.trim() === "") throw new DataError("lines contains an empty or non-string item");
    if ([...l.trim()].length > 40) throw new DataError("a line is longer than 40 characters");
  }
  if (!data.image || typeof data.image.url !== "string" || data.image.url === "")
    throw new DataError("image.url is missing");
  return {
    date: data.date,
    lines: data.lines.map((l) => [...l.trim()]),
    imageUrl: data.image.url,
  };
}

const overlaps = (a0, a1, b0, b1) => a0 < b1 && b0 < a1;

// Pick the largest font size (22px at most) where every column fits and the
// date does not collide with a column.
// cocoa-he.art joins the phrases inside a column with U+3000. When the columns
// as given do not fit (e.g. the whole poem in one column), give each phrase its own column.
export function layout(lines) {
  return fit(lines) ?? fit(splitPhrases(lines));
}

function splitPhrases(lines) {
  const phrases = lines.flatMap((chars) => chars.join("").split("　").filter(Boolean));
  return phrases.length <= 5 ? phrases.map((p) => [...p]) : lines;
}

function fit(lines) {
  const dateSpots = [620, COL_RIGHT - DATE.width];
  // For long columns, tighten the spacing between characters before shrinking the type.
  for (let fs = 22; fs >= 12; fs -= 0.5) {
    for (const lead of [1.45, 1.3, 1.15]) {
      const found = tryLayout(lines, fs, lead, dateSpots);
      if (found) return found;
    }
  }
  return null;
}

function tryLayout(lines, fs, lead, dateSpots) {
  const step = fs * lead;
  const colStep = (fs * 52) / 22;
  const cols = lines.map((chars, i) => {
    const cx = COL_RIGHT - fs / 2 - i * colStep;
    return { chars, cx, left: cx - fs / 2, right: cx + fs / 2, bottom: COL_TOP + chars.length * step };
  });
  if (cols.at(-1).left < COL_MIN_LEFT) return null;
  if (cols.some((c) => c.bottom > COL_BOTTOM)) return null;
  for (const dateX of dateSpots) {
    const clash = cols.some(
      (c) => overlaps(c.left - 6, c.right + 6, dateX, dateX + DATE.width) && c.bottom > DATE.top - 10,
    );
    if (!clash) return { fs, step, cols, dateX };
  }
  return null;
}

function glyph(ch, cx, cy, fs) {
  const base = cy + fs * 0.38; // baseline so that the em box is centred on cy
  const t = `<text x="${cx.toFixed(2)}" y="${base.toFixed(2)}" text-anchor="middle">${esc(ch)}</text>`;
  if (ROTATE.has(ch)) return `<g transform="rotate(90 ${cx.toFixed(2)} ${cy.toFixed(2)})">${t}</g>`;
  if (CORNER.has(ch)) return `<g transform="translate(${(fs * 0.56).toFixed(2)} ${(-fs * 0.56).toFixed(2)})">${t}</g>`;
  if (SMALL.has(ch)) return `<g transform="translate(${(fs * 0.1).toFixed(2)} ${(-fs * 0.1).toFixed(2)})">${t}</g>`;
  return t;
}

export function buildSvg({ date, lines }, image, theme) {
  const lay = layout(lines);
  if (!lay) throw new DataError("the poem does not fit the frame");
  const { fs, step, cols, dateX } = lay;
  const c = THEMES[theme];
  const glyphs = cols
    .flatMap((col) => col.chars.map((ch, i) => glyph(ch, col.cx, COL_TOP + step * (i + 0.5), fs)))
    .join("");
  const dateText = date.replaceAll("-", ".");
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><clipPath id="photo"><rect x="${PHOTO.x}" y="${PHOTO.y}" width="${PHOTO.w}" height="${PHOTO.h}"/></clipPath></defs>
<rect width="${W}" height="${H}" rx="4" fill="${c.paper}"/>
<g clip-path="url(#photo)"><image x="${PHOTO.x}" y="${PHOTO.y}" width="${PHOTO.w}" height="${PHOTO.h}" preserveAspectRatio="xMidYMid slice" xlink:href="data:${image.mime};base64,${image.data.toString("base64")}"/></g>
<g font-family="${SERIF}" font-weight="500" font-size="${fs}" fill="${c.ink}">${glyphs}</g>
<text x="${dateX}" y="${DATE.baseline}" font-family="${SANS}" font-size="${DATE.size}" letter-spacing="1" fill="${c.muted}">${esc(dateText)}</text>
</svg>`;
}

function sniff(buf) {
  if (buf.length > 8 && buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") return "image/png";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP")
    return "image/webp";
  if (buf.length > 6 && buf.toString("ascii", 0, 3) === "GIF") return "image/gif";
  return null;
}

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

async function fetchWithTimeout(url, ms = 20000) {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(ms), headers: { "user-agent": "motoshifurugen-profile" } });
  } catch (e) {
    throw new DataError(`request to ${url} failed: ${e.message}`);
  }
}

async function loadData() {
  if (process.env.FIXTURE) {
    const file = path.resolve(process.env.FIXTURE);
    return { data: JSON.parse(await readFile(file, "utf8")), base: pathToFileURL(file) };
  }
  const url = process.env.TODAY_URL || "https://cocoa-he.art/today.json";
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new DataError(`${url} returned HTTP ${res.status}`);
  const text = await res.text();
  try {
    return { data: JSON.parse(text), base: new URL(url) };
  } catch {
    throw new DataError(`${url} did not return JSON (starts with ${JSON.stringify(text.slice(0, 40))})`);
  }
}

async function loadImage(ref, base) {
  const url = new URL(ref, base);
  let buf;
  if (url.protocol === "file:") {
    if (base.protocol !== "file:") throw new DataError("image.url must be http(s)");
    buf = await readFile(fileURLToPath(url)).catch((e) => {
      throw new DataError(`cannot read image: ${e.message}`);
    });
  } else if (url.protocol === "https:" || url.protocol === "http:") {
    const res = await fetchWithTimeout(url.href);
    if (!res.ok) throw new DataError(`image ${url.href} returned HTTP ${res.status}`);
    buf = Buffer.from(
      await res.arrayBuffer().catch((e) => {
        throw new DataError(`image download failed: ${e.message}`);
      }),
    );
  } else {
    throw new DataError(`unsupported image URL scheme ${url.protocol}`);
  }
  if (buf.length > MAX_IMAGE_BYTES) throw new DataError(`image is larger than ${MAX_IMAGE_BYTES} bytes`);
  const mime = sniff(buf);
  if (!mime) throw new DataError("image is not PNG, JPEG, WebP or GIF");
  const image = { data: buf, mime };
  if (!decodes(image)) throw new DataError("image could not be decoded");
  return image;
}

// resvg silently skips images it cannot decode, so draw the photo alone and
// make sure some pixels came out.
function decodes(image) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="32" height="32"><image width="32" height="32" preserveAspectRatio="xMidYMid slice" xlink:href="data:${image.mime};base64,${image.data.toString("base64")}"/></svg>`;
  const { pixels } = new Resvg(svg, { font: { loadSystemFonts: false } }).render();
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) return true;
  return false;
}

export function render(svg, fontDir) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "zoom", value: 2 },
    font: {
      loadSystemFonts: false,
      fontFiles: [path.join(fontDir, "NotoSerifJP-Medium.otf"), path.join(fontDir, "NotoSansJP-Regular.otf")],
      defaultFontFamily: SANS,
    },
  });
  return resvg.render().asPng();
}

export async function main() {
  const fontDir = path.resolve(process.env.FONT_DIR || ".fonts");
  const outDir = path.resolve(process.env.OUT_DIR || "out");
  let poem;
  let image;
  try {
    const { data, base } = await loadData();
    poem = validate(data);
    image = await loadImage(poem.imageUrl, base);
  } catch (e) {
    if (e instanceof DataError) {
      console.log(`::warning::tanka not updated: ${e.message}`);
      return;
    }
    throw e;
  }
  const pngs = {};
  for (const theme of Object.keys(THEMES)) {
    try {
      pngs[theme] = render(buildSvg(poem, image, theme), fontDir);
    } catch (e) {
      if (e instanceof DataError) {
        console.log(`::warning::tanka not updated: ${e.message}`);
        return;
      }
      throw e;
    }
  }
  await mkdir(outDir, { recursive: true });
  for (const [theme, png] of Object.entries(pngs)) {
    const file = path.join(outDir, `tanka-${theme}.png`);
    await writeFile(file, png);
    console.log(`wrote ${file} (${png.length} bytes)`);
  }
  console.log(`tanka for ${poem.date}: ${poem.lines.map((l) => l.join("")).join(" / ")}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
