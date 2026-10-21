// Draws the app icons (white house on jacaranda, kanga stripe) into public/icons.
import sharp from "sharp";

const svg = (size, pad) => {
  const s = size, p = pad, w = s - 2 * p;
  const x = (f) => p + f * w, y = (f) => p + f * w;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" fill="#5B3F8C"/>
  <path d="M${x(0.18)} ${y(0.52)} L${x(0.5)} ${y(0.24)} L${x(0.82)} ${y(0.52)}" fill="none" stroke="#FFFAF2" stroke-width="${w * 0.07}" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M${x(0.27)} ${y(0.46)} V${y(0.76)} H${x(0.73)} V${y(0.46)}" fill="none" stroke="#FFFAF2" stroke-width="${w * 0.07}" stroke-linejoin="round"/>
  <rect x="${x(0.44)}" y="${y(0.6)}" width="${w * 0.12}" height="${w * 0.16}" fill="#C8893B"/>
  <rect x="${x(0.18)}" y="${y(0.84)}" width="${w * 0.64}" height="${w * 0.035}" fill="#C8893B"/>
</svg>`;
};

const out = [
  ["icon-192.png", 192, 8],
  ["icon-512.png", 512, 20],
  ["maskable-512.png", 512, 90],
  ["apple-touch-icon.png", 180, 14],
];
for (const [name, size, pad] of out) {
  await sharp(Buffer.from(svg(size, pad))).png().toFile(`public/icons/${name}`);
  console.log("wrote", name);
}
