// Puts what the push scheduler needs into Supabase Vault: the app's /api/push/tick address and
// NOTIFY_SHARED_SECRET from .env.local. Prints names only, never the values.
// Usage: node scripts/push-setup.mjs [https://your-app.vercel.app]
import pg from "pg";
import { readEnv, requireEnv } from "./env.mjs";

const env = readEnv();
requireEnv(env, ["SUPABASE_DB_URL", "NOTIFY_SHARED_SECRET", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"]);
const appUrl = (process.argv[2] || env.APP_URL || "https://kimemiah-family.vercel.app").replace(/\/$/, "");

const client = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

async function put(name, value) {
  const { rows } = await client.query("select id from vault.secrets where name = $1", [name]);
  if (rows.length) await client.query("select vault.update_secret($1, $2)", [rows[0].id, value]);
  else await client.query("select vault.create_secret($1, $2)", [value, name]);
  console.log(`  ✓ ${name} saved in Vault`);
}

try {
  await put("push_tick_url", `${appUrl}/api/push/tick`);
  await put("notify_shared_secret", env.NOTIFY_SHARED_SECRET);
  const { rows } = await client.query("select active from cron.job where jobname = 'push-tick'");
  console.log(rows[0]?.active ? "  ✓ scheduler runs every 5 minutes" : "  ✗ scheduler missing: run npm run db:migrate");
  console.log(`  Alerts go out from ${appUrl}. Vercel needs VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and NOTIFY_SHARED_SECRET (npm run vercel:env).`);
} finally {
  await client.end();
}
