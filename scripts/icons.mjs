// Renders the app icons from one SVG. Run with `node scripts/icons.mjs` after changing the design.
import sharp from "sharp";

const BG = "#0b0b0f";
const ACCENT = "#ff5c5c";
const INK = "#f4f4f6";

// A record dot inside a clock ring that is 5/6 complete: "your hour, on camera".
const mark = (fill, ring, bg) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  ${bg ? `<rect width="512" height="512" fill="${bg}"/>` : ""}
  <circle cx="256" cy="256" r="96" fill="${fill}"/>
  <circle cx="256" cy="256" r="168" fill="none" stroke="${ring}" stroke-width="26" stroke-linecap="round"
          stroke-dasharray="880 1056" transform="rotate(-90 256 256)"/>
</svg>`;

const full = Buffer.from(mark(ACCENT, INK, BG));
const badge = Buffer.from(mark("#ffffff", "#ffffff", null));

const out = [
  ["public/icon-192.png", full, 192],
  ["public/icon-512.png", full, 512],
  ["public/icon-maskable-512.png", full, 512],
  ["public/badge-96.png", badge, 96],
  ["src/app/apple-icon.png", full, 180],
  ["src/app/icon.png", full, 64],
];

for (const [file, svg, size] of out) {
  await sharp(svg, { density: 300 }).resize(size, size).png().toFile(file);
  console.log("wrote", file);
}
