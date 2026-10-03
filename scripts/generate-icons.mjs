// Rasterises the extension icon (mirrors public/icons/icon.svg) into the PNG
// sizes Chrome needs, with no image-library dependency. Run: node scripts/generate-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SIZES = [16, 32, 48, 128];
const SAMPLES = 4; // supersampling per axis for anti-aliasing

const stops = [
  [0, [0xff, 0x7e, 0xb3]],
  [0.55, [0xea, 0x4c, 0x89]],
  [1, [0xb8, 0x35, 0x7a]],
];

function gradient(t) {
  for (let i = 1; i < stops.length; i++) {
    const [t1, c1] = stops[i];
    const [t0, c0] = stops[i - 1];
    if (t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return c0.map((v, k) => v + (c1[k] - v) * f);
    }
  }
  return stops.at(-1)[1];
}

/** 4-point star centred at (cx, cy) with outer radius r and inner offset d (128-unit space). */
const star = (cx, cy, r, d) => [
  [cx, cy - r], [cx + d, cy - d], [cx + r, cy], [cx + d, cy + d],
  [cx, cy + r], [cx - d, cy + d], [cx - r, cy], [cx - d, cy - d],
];
const stars = [
  { poly: star(54, 56, 30, 7.5), alpha: 1 },
  { poly: star(88, 85, 15, 3.8), alpha: 0.92 },
  { poly: star(90, 33, 9, 2.4), alpha: 0.85 },
];

function inPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inRoundedRect(x, y) {
  const [min, max, r] = [4, 124, 30];
  if (x < min || x > max || y < min || y > max) return false;
  const cx = Math.min(Math.max(x, min + r), max - r);
  const cy = Math.min(Math.max(y, min + r), max - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/** Returns premultiplied-free RGBA for one point in 128-unit space. */
function shade(x, y) {
  if (!inRoundedRect(x, y)) return [0, 0, 0, 0];
  let color = gradient((x + y) / 256);
  for (const { poly, alpha } of stars) {
    if (inPolygon(x, y, poly)) color = color.map((v) => v + (255 - v) * alpha);
  }
  return [...color, 255];
}

function render(size) {
  const rows = [];
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 4); // filter byte 0 + RGBA
    for (let px = 0; px < size; px++) {
      let [r, g, b, a] = [0, 0, 0, 0];
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = ((px + (sx + 0.5) / SAMPLES) / size) * 128;
          const y = ((py + (sy + 0.5) / SAMPLES) / size) * 128;
          const [cr, cg, cb, ca] = shade(x, y);
          r += cr * ca; g += cg * ca; b += cb * ca; a += ca;
        }
      }
      const o = 1 + px * 4;
      const n = SAMPLES * SAMPLES;
      row[o] = a ? Math.round(r / a) : 0;
      row[o + 1] = a ? Math.round(g / a) : 0;
      row[o + 2] = a ? Math.round(b / a) : 0;
      row[o + 3] = Math.round(a / n);
    }
    rows.push(row);
  }
  return encodePng(size, size, Buffer.concat(rows));
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(width, height, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of SIZES) {
  writeFileSync(new URL(`../public/icons/icon-${size}.png`, import.meta.url), render(size));
  console.log(`icon-${size}.png`);
}
