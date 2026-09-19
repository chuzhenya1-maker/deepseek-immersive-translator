import { Buffer } from 'node:buffer';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const sizes = [16, 32, 48, 128];
const outputDirectory = resolve('public/icons');

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function createIcon(size) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  const radius = size * 0.44;
  const stroke = Math.max(1.2, size * 0.075);
  for (let y = 0; y < size; y += 1) {
    raw[y * stride] = 0;
    for (let x = 0; x < size; x += 1) {
      const nx = (x + 0.5) / size;
      const ny = (y + 0.5) / size;
      const inside = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) <= radius;
      const left = distanceToSegment(nx, ny, 0.31, 0.72, 0.49, 0.27) * size <= stroke;
      const right = distanceToSegment(nx, ny, 0.49, 0.27, 0.67, 0.72) * size <= stroke;
      const bar = nx >= 0.37 && nx <= 0.61 && ny >= 0.52 && ny <= 0.52 + stroke / size;
      const mark = inside && (left || right || bar);
      const offset = y * stride + 1 + x * 4;
      raw[offset] = mark ? 255 : inside ? 49 : 0;
      raw[offset + 1] = mark ? 255 : inside ? 95 : 0;
      raw[offset + 2] = mark ? 255 : inside ? 209 : 0;
      raw[offset + 3] = inside ? 255 : 0;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

await mkdir(outputDirectory, { recursive: true });
await Promise.all(
  sizes.map((size) =>
    writeFile(resolve(outputDirectory, `icon${size}.png`), createIcon(size)),
  ),
);
