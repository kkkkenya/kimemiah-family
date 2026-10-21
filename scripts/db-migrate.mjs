// Applies supabase/migrations/*.sql in order (each once), then supabase/seed.sql with --seed.
// Uses SUPABASE_DB_URL from .env.local. Never prints the connection string.
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { readEnv, requireEnv } from "./env.mjs";

const env = readEnv();
requireEnv(env, ["SUPABASE_DB_URL"]);

const dir = path.resolve("supabase/migrations");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

const client = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  await client.query(`
    create schema if not exists app_meta;
    create table if not exists app_meta.migrations (name text primary key, applied_at timestamptz not null default now());
  `);
  const { rows } = await client.query("select name from app_meta.migrations");
  const done = new Set(rows.map((r) => r.name));

  for (const file of files) {
    if (done.has(file)) {
      console.log(`  - ${file} (already applied)`);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into app_meta.migrations (name) values ($1)", [file]);
      await client.query("commit");
      console.log(`  ✓ ${file}`);
    } catch (err) {
      await client.query("rollback");
      console.error(`  ✗ ${file}: ${err.message}`);
      process.exit(1);
    }
  }

  if (process.argv.includes("--seed")) {
    const seed = fs.readFileSync(path.resolve("supabase/seed.sql"), "utf8");
    await client.query("begin");
    await client.query(seed);
    await client.query("commit");
    console.log("  ✓ seed.sql");
  }
  // Tell the API about new tables and functions.
  await client.query("notify pgrst, 'reload schema'");
} finally {
  await client.end();
}
