// Draws one icon per kind of notification into public/icons: n-<type>.png (the coloured round
// icon in the alert) and b-<type>.png (the small white badge Android shows in the status bar).
// Colours match lib/push/style.ts.
import sharp from "sharp";

// Simple line drawings on a 24 x 24 grid.
const GLYPH = {
  urgent: '<path d="M12 5v9"/><circle cx="12" cy="18.5" r="1.2" fill="#fff"/>',
  due: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
  suggest: '<circle cx="12" cy="7.5" r="3"/><path d="M5.5 20c.6-4 3.2-6 6.5-6s5.9 2 6.5 6"/>',
  team: '<circle cx="8.5" cy="8.5" r="2.6"/><circle cx="15.5" cy="8.5" r="2.6"/><path d="M3.5 19c.5-3.2 2.4-5 5-5s4.5 1.8 5 5M10.5 19c.5-3.2 2.4-5 5-5s4.5 1.8 5 5"/>',
  thanks: '<path d="M12 19.5s-7-4.3-7-9.2A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.3c0 4.9-7 9.2-7 9.2Z"/>',
  money: '<rect x="3.5" y="7" width="17" height="10" rx="2"/><circle cx="12" cy="12" r="2.4"/>',
  bill: '<path d="M6.5 3.5h11v17l-2.2-1.4-2.2 1.4-2.2-1.4-2.2 1.4-2.2-1.4Z"/><path d="M9 8.5h6M9 12h6"/>',
  question: '<path d="M9 9a3 3 0 1 1 4.2 2.8c-.8.4-1.2 1-1.2 1.9V14.5"/><circle cx="12" cy="18.5" r="1.2" fill="#fff"/>',
  swap: '<path d="M5 9h13l-3.5-3.5M19 15H6l3.5 3.5"/>',
  shop: '<path d="M4 5h2l1.8 9.5h9.4L19 8H7.2"/><circle cx="9.5" cy="18.5" r="1.3"/><circle cx="16" cy="18.5" r="1.3"/>',
  group: '<path d="M4 11.5 12 5l8 6.5M6.5 10v9h11v-9"/>',
  test: '<path d="m5.5 12.5 4 4 9-9"/>',
};
const COLOR = {
  urgent: "#B42318", due: "#E8590C", suggest: "#0C4A59", team: "#2F6B2A", thanks: "#B8577A", money: "#A16207",
  bill: "#6D28D9", question: "#B45309", swap: "#4338CA", shop: "#15803D", group: "#22201D", test: "#2F6B2A",
};

const icon = (type, size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
  <circle cx="12" cy="12" r="12" fill="${COLOR[type]}"/>
  <g transform="translate(4.8 4.8) scale(0.6)" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${GLYPH[type]}</g>
</svg>`;
const badge = (type, size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
  <g fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${GLYPH[type]}</g>
</svg>`;

for (const type of Object.keys(GLYPH)) {
  await sharp(Buffer.from(icon(type, 192))).png().toFile(`public/icons/n-${type}.png`);
  await sharp(Buffer.from(badge(type, 96))).png().toFile(`public/icons/b-${type}.png`);
}
console.log(`wrote ${Object.keys(GLYPH).length * 2} notification icons`);
