/**
 * Generates the MEDUSA OS launcher icons (public/icons/icon-192.png,
 * icon-512.png) with zero dependencies — a tiny PNG encoder plus pixel math.
 * Drawn at 2x and box-downsampled for smooth edges. Safe for maskable use:
 * the background bleeds to the edges, the artwork stays in the 80% zone.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ---------------- PNG encoding ---------------- */
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  const src = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    src.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

/* ---------------- artwork ---------------- */
// MEDUSA palette — same family as the midnight theme.
const BG = [11, 14, 21]; // near-black slate
const SCLERA = [241, 245, 249]; // off-white
const RING = [139, 92, 246]; // violet accent
const IRIS = [110, 89, 210]; // deeper violet
const PUPIL = [13, 6, 33]; // almost black
const GLINT = [255, 255, 255];

/** Draw at size x size; halfSS supersampling (1 = direct). */
function drawEye(size) {
  const px = new Uint8ClampedArray(size * size * 4);
  const c = size / 2;
  const put = (x, y, r, g, b) => {
    const i = (y * size + x) * 4;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = 255;
  };
  const eyeDX = (x, y) => (x - c) / (size * 0.055); // horizontal stretch -> slightly opened eye
  const eyeDist = (x, y) => Math.hypot(eyeDX(x, y) * 0.055 * size, (y - c)) / size;
  const rRing = 0.36,
    rLens = 0.3,
    rIris = 0.17,
    rPupil = 0.082;
  const glintX = c - 0.09 * size,
    glintY = c - 0.09 * size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = eyeDist(x, y);
      if (d > rRing) put(x, y, ...BG);
      else if (d > rLens) put(x, y, ...RING);
      else if (d > rIris) put(x, y, ...SCLERA);
      else if (d > rPupil) put(x, y, ...IRIS);
      else put(x, y, ...PUPIL);
      if (Math.hypot(x - glintX, y - glintY) / size < 0.032) put(x, y, ...GLINT);
    }
  }
  return px;
}

function boxDownsample(src, big, small) {
  const f = big / small;
  const out = new Uint8ClampedArray(small * small * 4);
  for (let y = 0; y < small; y++) {
    for (let x = 0; x < small; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0,
        n = 0;
      for (let dy = 0; dy < f; dy++) {
        for (let dx = 0; dx < f; dx++) {
          const i = ((y * f + dy) * big + (x * f + dx)) * 4;
          r += src[i];
          g += src[i + 1];
          b += src[i + 2];
          a += src[i + 3];
          n++;
        }
      }
      const o = (y * small + x) * 4;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
      out[o + 3] = a / n;
    }
  }
  return out;
}

mkdirSync(join(root, "public", "icons"), { recursive: true });
for (const size of [192, 512]) {
  const big = size * 2;
  const png = encodePng(size, size, boxDownsample(drawEye(big), big, size));
  const file = join(root, "public", "icons", `icon-${size}.png`);
  writeFileSync(file, png);
  console.log(`wrote ${file} (${png.length} bytes)`);
}
