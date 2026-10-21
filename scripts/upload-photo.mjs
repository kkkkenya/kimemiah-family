// Shrinks a photo, strips its hidden details (location, camera), and uploads it to the
// private "family" bucket as the Home screen photo.
// Usage: node scripts/upload-photo.mjs family.jpg
import fs from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { readEnv, requireEnv } from "./env.mjs";

const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.error("Usage: node scripts/upload-photo.mjs <photo file>");
  process.exit(1);
}

const env = readEnv();
requireEnv(env, ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// sharp drops metadata unless asked to keep it; rotate() applies the phone's orientation first.
const body = await sharp(file).rotate().resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toBuffer();

const { error } = await admin.storage.from("family").upload("home.jpg", body, {
  contentType: "image/jpeg",
  upsert: true,
  cacheControl: "3600",
});
if (error) {
  console.error(`Upload failed: ${error.message}`);
  process.exit(1);
}
console.log(`✓ Uploaded home photo (${Math.round(body.length / 1024)} KB). Phones pick it up on their next sync.`);
