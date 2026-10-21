// Reads and writes .env.local for the scripts (Next.js reads it on its own).
import fs from "node:fs";
import path from "node:path";

export const ENV_FILE = path.resolve(process.cwd(), ".env.local");

export function readEnv() {
  if (!fs.existsSync(ENV_FILE)) return {};
  const env = {};
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/\\\$/g, "$");
  }
  return env;
}

export function writeEnv(values, comments = {}) {
  const lines = ["# Kimemiah family app secrets. Written by: npm run setup", "# Never commit this file.", ""];
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === "") continue;
    if (comments[key]) lines.push(`# ${comments[key]}`);
    // Next.js expands $VAR in .env files; escape literal dollar signs.
    lines.push(`${key}=${String(value).replace(/\$/g, "\\$")}`);
  }
  fs.writeFileSync(ENV_FILE, lines.join("\n") + "\n", { mode: 0o600 });
}

export function requireEnv(env, keys) {
  const missing = keys.filter((k) => !env[k]);
  if (missing.length) {
    console.error(`Missing in .env.local: ${missing.join(", ")}\nRun: npm run setup`);
    process.exit(1);
  }
}
