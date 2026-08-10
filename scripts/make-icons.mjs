/**
 * Generates the PWA icons from the same geometry as the favicon in index.html,
 * so the two never drift apart.
 *
 *   node scripts/make-icons.mjs
 *
 * Writes real PNGs with no image dependency — Node's zlib does the deflating
 * and the rest is a minimal PNG container. Rasterised with 4x4 supersampling
 * so the curves don't look chewed at 192px.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

const BRAND = [0xb4, 0x53, 0x2a];
const WHITE = [0xff, 0xff, 0xff];

// ---------------------------------------------------------------------------
// PNG encoding
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // 10..12 = compression, filter, interlace — all zero.

  // Each scanline is prefixed with its filter byte (0 = none).
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// The artwork, in a 32x32 coordinate space (matching the favicon)
// ---------------------------------------------------------------------------

const roundedRect = (x, y, w, h, r) => (px, py) => {
  const cx = Math.max(x + r, Math.min(px, x + w - r));
  const cy = Math.max(y + r, Math.min(py, y + h - r));
  const dx = px - cx;
  const dy = py - cy;
  if (px >= x + r && px <= x + w - r) return py >= y && py <= y + h;
  if (py >= y + r && py <= y + h - r) return px >= x && px <= x + w;
  return dx * dx + dy * dy <= r * r;
};

const disc = (cx, cy, r) => (px, py) => (px - cx) ** 2 + (py - cy) ** 2 <= r * r;

const hLine = (x1, x2, y, t) => (px, py) =>
  px >= x1 && px <= x2 && Math.abs(py - y) <= t / 2;

const vLine = (y1, y2, x, t) => (px, py) =>
  py >= y1 && py <= y2 && Math.abs(px - x) <= t / 2;

/*
 * A chord diagram: a thick nut across the top, three frets, three strings, and
 * two fingered dots sitting inside the cells. The dots are placed at cell
 * centres and sized to clear the lines, so at 192px it still reads as a
 * fretboard rather than smearing into a glyph.
 */
const NUT_Y = 7;
const FRETS = [13, 19, 25];
const STRINGS = [8, 16, 24];
const DOTS = [
  [12, 10.4],
  [20, 16.2],
];

/** Returns [r,g,b,a] for a point in 32x32 space. */
function paint(px, py, { bleed }) {
  const bg = bleed
    ? () => true // maskable icons fill the whole canvas; the OS crops it
    : roundedRect(0, 0, 32, 32, 7);

  if (!bg(px, py)) return [0, 0, 0, 0];

  for (const [cx, cy] of DOTS) {
    if (disc(cx, cy, 2.1)(px, py)) return [...WHITE, 255];
  }
  if (hLine(8, 24, NUT_Y, 2.2)(px, py)) return [...WHITE, 255];
  for (const y of FRETS) {
    if (hLine(8, 24, y, 1)(px, py)) return [...WHITE, 200];
  }
  for (const x of STRINGS) {
    if (vLine(NUT_Y, 25, x, 1)(px, py)) return [...WHITE, 200];
  }
  return [...BRAND, 255];
}

function render(size, { bleed = false, safeZone = 1 } = {}) {
  const SS = 4; // supersampling factor
  const rgba = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          // Map pixel -> 32x32 art space, shrinking the art for maskable icons
          // so nothing important sits outside the safe zone.
          const fx = (x + (sx + 0.5) / SS) / size;
          const fy = (y + (sy + 0.5) / SS) / size;
          const ax = ((fx - 0.5) / safeZone + 0.5) * 32;
          const ay = ((fy - 0.5) / safeZone + 0.5) * 32;
          const [pr, pg, pb, pa] = paint(ax, ay, { bleed });
          r += pr * pa;
          g += pg * pa;
          b += pb * pa;
          a += pa;
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      rgba[i] = a ? Math.round(r / a) : 0;
      rgba[i + 1] = a ? Math.round(g / a) : 0;
      rgba[i + 2] = a ? Math.round(b / a) : 0;
      rgba[i + 3] = Math.round(a / n);
    }
  }
  return encodePng(size, size, rgba);
}

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  ["icon-192.png", render(192)],
  ["icon-512.png", render(512)],
  // Maskable: full bleed, art pulled into the middle 80% so Android can crop
  // it to a circle/squircle without clipping the dots.
  ["icon-maskable-512.png", render(512, { bleed: true, safeZone: 0.8 })],
  ["apple-touch-icon.png", render(180)],
];

for (const [name, buf] of targets) {
  writeFileSync(join(OUT_DIR, name), buf);
  console.log(`${name.padEnd(24)} ${(buf.length / 1024).toFixed(1)} kB`);
}
