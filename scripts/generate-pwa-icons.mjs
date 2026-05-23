import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const icons = [
  { file: "icon-192.png", size: 192, radius: 42 },
  { file: "icon-512.png", size: 512, radius: 112 },
  { file: "apple-touch-icon.png", size: 180, radius: 40 },
];

const black = [36, 39, 31, 255];
const white = [251, 250, 246, 255];
const transparent = [0, 0, 0, 0];

function makePng({ file, size, radius }) {
  const scale = size / 512;
  const sample = 4;
  const pixels = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < sample; sy += 1) {
        for (let sx = 0; sx < sample; sx += 1) {
          const px = x + (sx + 0.5) / sample;
          const py = y + (sy + 0.5) / sample;
          const color = pixelColor(px, py, size, radius, scale);

          r += color[0];
          g += color[1];
          b += color[2];
          a += color[3];
        }
      }

      const offset = (y * size + x) * 4;
      const count = sample * sample;
      pixels[offset] = Math.round(r / count);
      pixels[offset + 1] = Math.round(g / count);
      pixels[offset + 2] = Math.round(b / count);
      pixels[offset + 3] = Math.round(a / count);
    }
  }

  writeFileSync(join("public", file), encodePng(size, size, pixels));
}

function pixelColor(x, y, size, radius, scale) {
  if (!insideRoundedRect(x, y, 0, 0, size, size, radius)) {
    return transparent;
  }

  const inTopBar = inRect(x, y, 120 * scale, 136 * scale, 392 * scale, 216 * scale);
  const inStem = inRect(x, y, 208 * scale, 136 * scale, 304 * scale, 392 * scale);

  return inTopBar || inStem ? white : black;
}

function inRect(x, y, left, top, right, bottom) {
  return x >= left && x <= right && y >= top && y <= bottom;
}

function insideRoundedRect(x, y, left, top, width, height, radius) {
  const right = left + width;
  const bottom = top + height;
  const cx = x < left + radius ? left + radius : x > right - radius ? right - radius : x;
  const cy = y < top + radius ? top + radius : y > bottom - radius ? bottom - radius : y;
  const dx = x - cx;
  const dy = y - cy;

  return dx * dx + dy * dy <= radius * radius;
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr(width, height)),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function ihdr(width, height) {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = 8;
  data[9] = 6;
  data[10] = 0;
  data[11] = 0;
  data[12] = 0;
  return data;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);

  return Buffer.concat([length, name, data, crc]);
}

function crc32(buffer) {
  const table = crc32.table ?? makeCrcTable();
  crc32.table = table;

  let crc = -1;
  for (const byte of buffer) {
    crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
  }

  return (crc ^ -1) >>> 0;
}

function makeCrcTable() {
  return Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
  });
}

for (const icon of icons) {
  makePng(icon);
}

const digest = createHash("sha256")
  .update(icons.map((icon) => icon.file).join(":"))
  .digest("hex")
  .slice(0, 8);

console.log(`Generated ${icons.length} PWA icons (${digest}).`);
