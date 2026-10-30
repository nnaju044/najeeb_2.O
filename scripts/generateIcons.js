'use strict';

/**
 * Generates the PWA icons as real PNG files using only Node's zlib.
 * The mark is a rounded gold "L" monogram on the app's dark background.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(OUT_DIR, { recursive: true });

const BG = [16, 18, 22];
const SURFACE = [25, 29, 36];
const GOLD = [201, 168, 76];

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function createCanvas(size) {
  const pixels = Buffer.alloc(size * size * 4);
  return { size, pixels };
}

function setPixel(canvas, x, y, [r, g, b], alpha = 255) {
  if (x < 0 || y < 0 || x >= canvas.size || y >= canvas.size) return;
  const index = (y * canvas.size + x) * 4;
  canvas.pixels[index] = r;
  canvas.pixels[index + 1] = g;
  canvas.pixels[index + 2] = b;
  canvas.pixels[index + 3] = alpha;
}

function fillRoundedRect(canvas, x0, y0, width, height, radius, color) {
  for (let y = y0; y < y0 + height; y += 1) {
    for (let x = x0; x < x0 + width; x += 1) {
      const dx = Math.min(x - x0, x0 + width - 1 - x);
      const dy = Math.min(y - y0, y0 + height - 1 - y);
      if (dx < radius && dy < radius) {
        const distance = Math.hypot(radius - dx, radius - dy);
        if (distance > radius) continue;
      }
      setPixel(canvas, x, y, color);
    }
  }
}

function encodePng(canvas) {
  const { size, pixels } = canvas;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0;
    pixels.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function buildIcon(size, { maskable = false } = {}) {
  const canvas = createCanvas(size);
  // Background
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      setPixel(canvas, x, y, BG);
    }
  }
  const padding = Math.round(size * (maskable ? 0.16 : 0.12));
  const cardSize = size - padding * 2;
  fillRoundedRect(canvas, padding, padding, cardSize, cardSize, Math.round(cardSize * 0.24), SURFACE);

  // Gold "J" monogram for Jeebs 2.O
  const stroke = Math.round(size * 0.085);
  const stemX = Math.round(size * 0.52);
  const top = Math.round(size * 0.28);
  const height = Math.round(size * 0.44);
  const hookWidth = Math.round(size * 0.28);
  const hookLeft = stemX + stroke - hookWidth;
  const hookUp = Math.round(stroke * 2.2);

  // Top horizontal crossbar
  fillRoundedRect(canvas, Math.round(size * 0.40), top, Math.round(size * 0.26), stroke, Math.round(stroke / 2), GOLD);
  // Vertical stem
  fillRoundedRect(canvas, stemX, top, stroke, height, Math.round(stroke / 2), GOLD);
  // Bottom horizontal curve
  fillRoundedRect(canvas, hookLeft, top + height - stroke, hookWidth, stroke, Math.round(stroke / 2), GOLD);
  // Left upward hook
  fillRoundedRect(canvas, hookLeft, top + height - hookUp, stroke, hookUp, Math.round(stroke / 2), GOLD);

  return encodePng(canvas);
}

const targets = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: false },
];

for (const target of targets) {
  const buffer = buildIcon(target.size, { maskable: target.maskable });
  fs.writeFileSync(path.join(OUT_DIR, target.file), buffer);
  console.log(`wrote public/icons/${target.file} (${buffer.length} bytes)`);
}
