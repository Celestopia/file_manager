// Rasterize the SVG's straight-line geometry into a multi-resolution ICO.
// Header and native executable share src/assets/app-icon.svg as their source.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
const svg = readFileSync("src/assets/app-icon.svg", "utf8");
const segments = [];
for (const match of svg.matchAll(/<path d="([^"]+)"/g)) {
  const tokens = match[1].match(/[MmLlHhVvZz]|-?\d+(?:\.\d+)?/g);
  let i = 0,
    x = 0,
    y = 0,
    sx = 0,
    sy = 0,
    cmd = "";
  while (i < tokens.length) {
    if (/[a-z]/i.test(tokens[i])) cmd = tokens[i++];
    const relative = cmd === cmd.toLowerCase();
    let nx = x,
      ny = y;
    switch (cmd.toUpperCase()) {
      case "M":
      case "L":
        nx = Number(tokens[i++]) + (relative ? x : 0);
        ny = Number(tokens[i++]) + (relative ? y : 0);
        break;
      case "H":
        nx = Number(tokens[i++]) + (relative ? x : 0);
        break;
      case "V":
        ny = Number(tokens[i++]) + (relative ? y : 0);
        break;
      case "Z":
        nx = sx;
        ny = sy;
        break;
      default:
        throw Error(`Unsupported icon path command: ${cmd}`);
    }
    if (cmd.toUpperCase() === "M") {
      sx = nx;
      sy = ny;
    } else segments.push([x, y, nx, ny]);
    x = nx;
    y = ny;
    if (cmd === "M") cmd = "L";
    else if (cmd === "m") cmd = "l";
  }
}
const stroke = Number(svg.match(/stroke-width="([\d.]+)"/)[1]);
function distance(x, y, [ax, ay, bx, by]) {
  const dx = bx - ax,
    dy = by - ay,
    t = Math.max(
      0,
      Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)),
    );
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}
function bitmap(size) {
  const pixels = Buffer.alloc(size * size * 4),
    stride = Math.ceil(size / 32) * 4,
    mask = Buffer.alloc(size * stride),
    samples = 4;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let r = 0,
        g = 0,
        b = 0,
        coverage = 0;
      for (let sy = 0; sy < samples; sy++)
        for (let sx = 0; sx < samples; sx++) {
          const px = ((x + (sx + 0.5) / samples) * 24) / size,
            py = ((y + (sy + 0.5) / samples) * 24) / size;
          if (
            Math.hypot(
              Math.max(Math.abs(px - 12) - 7, 0),
              Math.max(Math.abs(py - 12) - 7, 0),
            ) > 5
          )
            continue;
          const ink = segments.some(
            (line) => distance(px, py, line) <= stroke / 2,
          );
          r += ink ? 245 : 49;
          g += ink ? 250 : 90;
          b += ink ? 244 : 67;
          coverage++;
        }
      const row = size - 1 - y,
        j = (row * size + x) * 4;
      if (coverage) {
        pixels[j] = Math.round(b / coverage);
        pixels[j + 1] = Math.round(g / coverage);
        pixels[j + 2] = Math.round(r / coverage);
        pixels[j + 3] = Math.round((255 * coverage) / (samples * samples));
      } else mask[row * stride + Math.floor(x / 8)] |= 1 << (7 - (x % 8));
    }
  const dib = Buffer.alloc(40);
  dib.writeUInt32LE(40, 0);
  dib.writeInt32LE(size, 4);
  dib.writeInt32LE(size * 2, 8);
  dib.writeUInt16LE(1, 12);
  dib.writeUInt16LE(32, 14);
  dib.writeUInt32LE(pixels.length + mask.length, 20);
  return Buffer.concat([dib, pixels, mask]);
}
const sizes = [16, 24, 32, 48, 256],
  images = sizes.map(bitmap),
  header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, i) => {
  const base = 6 + 16 * i;
  header[base] = size === 256 ? 0 : size;
  header[base + 1] = size === 256 ? 0 : size;
  header.writeUInt16LE(1, base + 4);
  header.writeUInt16LE(32, base + 6);
  header.writeUInt32LE(images[i].length, base + 8);
  header.writeUInt32LE(offset, base + 12);
  offset += images[i].length;
});
mkdirSync("src-tauri/icons", { recursive: true });
writeFileSync("src-tauri/icons/icon.ico", Buffer.concat([header, ...images]));
