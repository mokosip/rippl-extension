import sharp from "sharp";
import { readFileSync } from "fs";

const svg = readFileSync("./public/icon/rippl.svg");

for (const size of [16, 48, 128]) {
  // Scale the SVG by rewriting width/height, then rasterize
  const scaledSvg = svg.toString()
    .replace('width="32"', `width="${size}"`)
    .replace('height="32"', `height="${size}"`);

  await sharp(Buffer.from(scaledSvg))
    .resize(size, size)
    .png()
    .toFile(`./public/icon/${size}.png`);

  console.log(`Generated ${size}.png`);
}
