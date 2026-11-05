#!/usr/bin/env node
// AB-210-TRQ — مولّد أيقونة التطبيق (بلا اعتماديات): ينشئ PNG 1024×1024
// الاستخدام: node tools/make-icon.mjs [مسار-الإخراج]
import { writeFileSync } from 'node:fs';
import zlib from 'node:zlib';

const OUT = process.argv[2] || '/tmp/icon-master.png';
const W = 1024, H = 1024;
const BG_TOP = [0x0e, 0x15, 0x22], BG_BOT = [0x07, 0x0a, 0x10];
const GOLD = [0xf5, 0xc5, 0x18], WHITE = [0xf2, 0xf6, 0xfa];

const img = Buffer.alloc(W * H * 3);
for (let y = 0; y < H; y++) {
  const t = y / (H - 1);
  const row = Buffer.alloc(W * 3);
  for (let x = 0; x < W; x++) {
    row[x * 3] = Math.round(BG_TOP[0] + (BG_BOT[0] - BG_TOP[0]) * t);
    row[x * 3 + 1] = Math.round(BG_TOP[1] + (BG_BOT[1] - BG_TOP[1]) * t);
    row[x * 3 + 2] = Math.round(BG_TOP[2] + (BG_BOT[2] - BG_TOP[2]) * t);
  }
  row.copy(img, y * W * 3);
}

function blend(x, y, cov, color) {
  if (cov <= 0) return;
  if (cov > 1) cov = 1;
  const i = (y * W + x) * 3;
  img[i] = Math.round(img[i] + (color[0] - img[i]) * cov);
  img[i + 1] = Math.round(img[i + 1] + (color[1] - img[i + 1]) * cov);
  img[i + 2] = Math.round(img[i + 2] + (color[2] - img[i + 2]) * cov);
}

// حلقة ذهبية حول المحتوى
const CX = 512, CY = 512, R = 430, STROKE = 18, HALF = STROKE / 2;
for (let y = Math.floor(CY - R - STROKE); y <= CY + R + STROKE; y++) {
  for (let x = Math.floor(CX - R - STROKE); x <= CX + R + STROKE; x++) {
    const d = Math.hypot(x + 0.5 - CX, y + 0.5 - CY);
    const cov = Math.min(1, Math.max(0, 0.5 + (HALF + 0.5) - Math.abs(d - R)));
    if (cov > 0) blend(x, y, cov, GOLD);
  }
}

// خطوط رسم نقطية 5×7
const GL = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  2: ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '00100'],
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  // Q: دائرة بذيل بارز أسفل يمينها
  Q: ['01110', '10001', '10001', '10001', '10001', '10001', '01111', '00011'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
};

function drawText(text, scale, topY, color) {
  const gap = Math.floor(scale * 1.4);
  const totalW = scale * 5 * text.length + gap * (text.length - 1);
  const x0 = Math.floor((W - totalW) / 2);
  for (let ci = 0; ci < text.length; ci++) {
    const gx = x0 + ci * (scale * 5 + gap);
    const rows = GL[text[ci]];
    if (!rows) continue;
    for (let gr = 0; gr < rows.length; gr++) {
      for (let c = 0; c < 5; c++) {
        if (rows[gr][c] !== '1') continue;
        const rx0 = gx + c * scale, rx1 = gx + (c + 1) * scale;
        const ry0 = topY + gr * scale, ry1 = topY + (gr + 1) * scale;
        for (let y = Math.max(0, ry0 - 1); y < Math.min(H, ry1 + 2); y++) {
          for (let x = Math.max(0, rx0 - 1); x < Math.min(W, rx1 + 2); x++) {
            const cx = Math.max(0, Math.min(rx1, x + 1) - Math.max(rx0, x));
            const cy = Math.max(0, Math.min(ry1, y + 1) - Math.max(ry0, y));
            if (cx > 0 && cy > 0) blend(x, y, cx * cy, color);
          }
        }
      }
    }
  }
}

drawText('AB-210', 22, 340, WHITE);
drawText('TRQ', 32, 540, GOLD);

// ترميز PNG
function chunk(tag, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(tag, 'latin1');
  const crcBuf = Buffer.alloc(4);
  const crc = zlib.crc32 ? zlib.crc32(Buffer.concat([t, data])) : crc32(Buffer.concat([t, data]));
  crcBuf.writeUInt32BE(crc >>> 0);
  return Buffer.concat([len, t, data, crcBuf]);
}
function crc32(buf) {
  let c, table = [];
  for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = (table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
  return (crc ^ 0xffffffff) >>> 0;
}
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 3 + 1)] = 0;
  img.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
writeFileSync(OUT, png);
console.log('[make-icon] ' + OUT + ' (' + png.length + ' bytes, 1024x1024)');
