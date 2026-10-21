// Copies the server's values from .env.local to the Vercel project (production),
// piping each through stdin so it never appears on screen or in the command line.
// Usage: node scripts/vercel-env.mjs   (after `npx vercel link`)
import { spawnSync } from "node:child_process";
import { readEnv, requireEnv } from "./env.mjs";

const NAMES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "FAMILY_PIN_HASH",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "NOTIFY_SHARED_SECRET",
];

const env = readEnv();
requireEnv(env, NAMES);

const vercel = (args, input) =>
  spawnSync("npx", ["--yes", "vercel", ...args], { input, encoding: "utf8", shell: process.platform === "win32" });

for (const name of NAMES) {
  vercel(["env", "rm", name, "production", "--yes"]); // fine if it didn't exist
  const r = vercel(["env", "add", name, "production"], env[name]);
  console.log(r.status === 0 ? `  ✓ ${name}` : `  ✗ ${name}: ${(r.stderr || r.stdout).trim().split("\n").pop()}`);
  if (r.status !== 0) process.exitCode = 1;
}
