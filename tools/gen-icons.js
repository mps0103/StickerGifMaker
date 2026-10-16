/*
 * Generates the launcher icon, round icon, adaptive foreground, splash mark and the
 * Play Store listing icon. Pure Node: a tiny PNG writer plus a supersampled
 * signed-distance rasterizer, so the art is regenerated from source instead of being
 * checked in as opaque binaries.
 *
 *   node tools/gen-icons.js android/app/src/main/res store/play_icon_512.png
 *
 * The mark is two die-cut stickers stacked at an angle - a yellow one behind, the
 * marker-pink one in front - which is the app's subject and its accent colour.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---------- PNG ----------
let CRC_TABLE = null;
function crcTable() {
  if (CRC_TABLE) return CRC_TABLE;
  CRC_TABLE = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    CRC_TABLE[n] = c;
  }
  return CRC_TABLE;
}
function crc32(buf) {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, {level: 9})),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- colour ----------
const PINK = [0xff, 0x3d, 0x87];
const PINK_LIGHT = [0xff, 0x77, 0xac];
const YELLOW = [0xff, 0xc9, 0x4d];
const YELLOW_DEEP = [0xff, 0xa8, 0x2b];
const WHITE = [0xff, 0xff, 0xff];
const BOARD = [0x14, 0x11, 0x19];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// ---------- geometry ----------
/** Signed distance to a rotated rounded rectangle; negative inside. */
function sdRoundRect(px, py, cx, cy, w, h, r, angle) {
  const dx = px - cx;
  const dy = py - cy;
  const ca = Math.cos(-angle);
  const sa = Math.sin(-angle);
  const x = dx * ca - dy * sa;
  const y = dx * sa + dy * ca;
  const qx = Math.abs(x) - (w / 2 - r);
  const qy = Math.abs(y) - (h / 2 - r);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return Math.min(Math.max(qx, qy), 0) + outside - r;
}

/** One sticker: white die-cut border with a soft vertical gradient inside. */
function sticker(px, py, cx, cy, size, angle, top, bottom, border) {
  const d = sdRoundRect(px, py, cx, cy, size, size, size * 0.26, angle);
  if (d > 0) return null;
  if (d > -border) return [WHITE[0], WHITE[1], WHITE[2], 255];
  // Gradient runs along the sticker's own axis so it stays put when tilted.
  const dy = py - cy;
  const dx = px - cx;
  const local = dx * Math.sin(angle) + dy * Math.cos(angle);
  const t = Math.min(1, Math.max(0, local / size + 0.5));
  const c = mix(top, bottom, t);
  return [c[0], c[1], c[2], 255];
}

/** Paints the mark. `bg` null keeps the canvas transparent (adaptive foreground). */
function render(size, opts) {
  const {bg, scale, round} = opts;
  const SS = 4; // supersampling factor per axis
  const out = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const unit = size * scale; // size of the front sticker

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;

          let col = null;
          let alpha = 0;
          if (bg) {
            if (round) {
              if (Math.hypot(px - c, py - c) <= size / 2) { col = bg; alpha = 255; }
            } else {
              col = bg;
              alpha = 255;
            }
          }

          // Back sticker, tilted the other way and peeking out behind.
          const back = sticker(
            px, py, c + unit * 0.17, c - unit * 0.15, unit * 0.86, 0.30,
            YELLOW, YELLOW_DEEP, unit * 0.075,
          );
          if (back) { col = back; alpha = 255; }

          // Front sticker.
          const front = sticker(
            px, py, c - unit * 0.09, c + unit * 0.09, unit, -0.22,
            PINK_LIGHT, PINK, unit * 0.085,
          );
          if (front) { col = front; alpha = 255; }

          if (col && alpha) { r += col[0]; g += col[1]; b += col[2]; a += alpha; }
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      if (a > 0) {
        // Average over covered samples only, so edges stay coloured not muddied.
        const cov = a / 255;
        out[i] = Math.round(r / cov);
        out[i + 1] = Math.round(g / cov);
        out[i + 2] = Math.round(b / cov);
        out[i + 3] = Math.round(a / n);
      }
    }
  }
  return encodePNG(size, size, out);
}

// ---------- outputs ----------
const RES = process.argv[2];
const STORE = process.argv[3];
if (!RES) {
  console.error('usage: node tools/gen-icons.js <android res dir> [play store icon path]');
  process.exit(1);
}

const DENSITIES = [['mdpi', 1], ['hdpi', 1.5], ['xhdpi', 2], ['xxhdpi', 3], ['xxxhdpi', 4]];

for (const [name, f] of DENSITIES) {
  const dir = path.join(RES, 'mipmap-' + name);
  fs.mkdirSync(dir, {recursive: true});

  // Adaptive foreground: 108dp canvas, art inside the 72dp safe zone.
  const fg = Math.round(108 * f);
  fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'),
    render(fg, {bg: null, scale: 0.40, round: false}));

  // Legacy icons for API 24-25, which have no adaptive icon.
  const legacy = Math.round(48 * f);
  fs.writeFileSync(path.join(dir, 'ic_launcher.png'),
    render(legacy, {bg: BOARD, scale: 0.52, round: false}));
  fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'),
    render(legacy, {bg: BOARD, scale: 0.52, round: true}));
}

// Splash mark: 288dp canvas, art kept inside the inner third the system leaves visible.
const splashDir = path.join(RES, 'drawable');
fs.mkdirSync(splashDir, {recursive: true});
fs.writeFileSync(path.join(splashDir, 'splash_logo.png'),
  render(288 * 4, {bg: null, scale: 0.30, round: false}));

// Play Store listing icon: 512x512, square (Play applies its own mask), opaque.
if (STORE) {
  fs.mkdirSync(path.dirname(STORE), {recursive: true});
  fs.writeFileSync(STORE, render(512, {bg: BOARD, scale: 0.5, round: false}));
}

console.log('icons, splash' + (STORE ? ' and store icon' : '') + ' written');
