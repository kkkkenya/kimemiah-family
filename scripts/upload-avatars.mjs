// Shrinks the profile pictures in a folder (square, 256 px, no hidden details) and uploads them
// to the private "family" bucket as avatars/a1.jpg, a2.jpg ... in name order. Blank images are skipped.
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

const files = fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
let n = 0;
for (const f of files) {
  const file = path.join(dir, f);
  const stats = await sharp(file).stats();
  if (stats.channels.every((c) => c.max - c.min < 8)) {
    console.log(`  - ${f}: blank, skipped`);
    continue;
  }
  n++;
  // Square crop toward the top, where faces usually are.
  const body = await sharp(file).rotate().resize(256, 256, { fit: "cover", position: "top" }).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
  const { error } = await admin.storage.from("family").upload(`avatars/a${n}.jpg`, body, { contentType: "image/jpeg", upsert: true, cacheControl: "86400" });
  console.log(error ? `  ✗ ${f}: ${error.message}` : `  ✓ ${f} -> a${n} (${Math.round(body.length / 1024)} KB)`);
}
console.log(`${n} pictures. Keep AVATAR_COUNT in lib/avatars.ts at ${n}.`);
