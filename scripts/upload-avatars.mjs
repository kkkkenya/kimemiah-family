// Crops the profile pictures in a folder to squares centred on each face (focal points in
// scripts/avatars.json), shrinks them to 256 px with no hidden details, and uploads them to the
// private "family" bucket as avatars/a1.jpg, a2.jpg ... Ids stay fixed, so nobody's choice changes.
// Usage: node scripts/upload-avatars.mjs "C:/Users/you/Downloads/profile pics"
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { readEnv, requireEnv } from "./env.mjs";

const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) {
  console.error('Usage: node scripts/upload-avatars.mjs "<folder of pictures>"');
  process.exit(1);
}
const env = readEnv();
requireEnv(env, ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// id, file, and where the face is: y (and x) as a share of the picture, side as a share of its
// shorter edge, pad to widen tall artwork with white first.
const pictures = JSON.parse(fs.readFileSync(new URL("./avatars.json", import.meta.url), "utf8"));

async function square(file, c) {
  let img = sharp(file).rotate().flatten({ background: "#fff" });
  if (c.pad) {
    const { width } = await img.metadata();
    const p = Math.round(width * c.pad);
    img = sharp(await img.extend({ left: p, right: p, background: "#fff" }).toBuffer());
  }
  const { width: W, height: H } = await img.metadata();
  const side = Math.round(Math.min(W, H) * (c.side ?? 1));
  const left = Math.max(0, Math.min(W - side, Math.round(W * (c.x ?? 0.5) - side / 2)));
  const top = Math.max(0, Math.min(H - side, Math.round(H * c.y - side / 2)));
  return img.extract({ left, top, width: side, height: side }).resize(256, 256).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
}

for (const c of pictures) {
  const file = path.join(dir, c.file);
  if (!fs.existsSync(file)) {
    console.log(`  - ${c.id}: ${c.file} not in the folder, skipped`);
    continue;
  }
  const body = await square(file, c);
  const { error } = await admin.storage.from("family").upload(`avatars/${c.id}.jpg`, body, { contentType: "image/jpeg", upsert: true, cacheControl: "86400" });
  console.log(error ? `  ✗ ${c.id}: ${error.message}` : `  ✓ ${c.file} -> ${c.id} (${Math.round(body.length / 1024)} KB)`);
}
console.log(`${pictures.length} pictures. Keep AVATARS in components/Avatar.tsx at ${pictures.length}.`);
