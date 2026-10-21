// Asks for the app's secret values (hidden input), checks each one, and writes .env.local.
// Press Enter at any question to keep the value you already have.
// Run in PowerShell, Command Prompt or Windows Terminal:  npm run setup
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import bcrypt from "bcryptjs";
import pg from "pg";
import { generateIdentity, identityToRecipient } from "age-encryption";
import { readEnv, writeEnv, ENV_FILE } from "./env.mjs";

const REPO = "kkkkenya/kimemiah-family";
// Session pooler host for this project (dashboard › Connect › Session pooler). Not a secret.
const POOLER_HOST = "aws-0-eu-west-2.pooler.supabase.com";

if (!process.stdin.isTTY) {
  console.error("This script needs a real terminal for hidden input. Run it in PowerShell or Windows Terminal: npm run setup");
  process.exit(1);
}

// ---------------------------------------------------------------- prompts

function prompt(question, { hidden = false, current } = {}) {
  const hint = current ? " (Enter keeps current)" : "";
  process.stdout.write(`${question}${hint}: `);
  return new Promise((resolve) => {
    const stdin = process.stdin;
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\u0003") {
          process.stdout.write("\n");
          process.exit(130);
        } else if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          resolve(value.trim() || current || "");
          return;
        } else if (ch === "\u007f" || ch === "\b") {
          if (value.length) {
            value = value.slice(0, -1);
            process.stdout.write("\b \b");
          }
        } else if (ch >= " ") {
          value += ch;
          process.stdout.write(hidden ? "*" : ch);
        }
      }
    };
    stdin.on("data", onData);
  });
}

async function askChecked(label, { hidden, current, check, help, clean = (v) => v.trim() }) {
  if (help) console.log(`\n${help}`);
  for (;;) {
    const value = clean(await prompt(label, { hidden, current }));
    if (!value) {
      console.log("  A value is needed here.");
      continue;
    }
    const problem = await check(value);
    if (!problem) {
      console.log("  ✓ OK");
      return value;
    }
    console.log(`  ✗ ${problem}`);
    // An existing value that is wrong (not just unreachable) shouldn't be offered again.
    if (value === current && !/Couldn't reach/.test(problem)) current = undefined;
  }
}

// ---------------------------------------------------------------- checks

// Accepts the URL with extras people often copy along (…/rest/v1/, a trailing slash).
function normaliseUrl(url) {
  return url.trim().replace(/\/(rest|auth)\/v1\/?.*$/, "").replace(/\/+$/, "");
}

// One retry, so a brief network hiccup doesn't look like a wrong value.
async function get(url, headers) {
  try {
    return await fetch(url, { headers });
  } catch {
    try {
      return await fetch(url, { headers });
    } catch (err) {
      return { networkError: err.cause?.code ?? err.message };
    }
  }
}

// Legacy keys are JWTs (eyJ…) and also go in the Authorization header; new sb_ keys go in apikey only.
const keyHeaders = (key) => (key.startsWith("eyJ") ? { apikey: key, authorization: `Bearer ${key}` } : { apikey: key });

async function checkUrl(url) {
  if (!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(url)) {
    return "Should look like https://abcdefghijklmnopqrst.supabase.co (Project Settings › API › Project URL).";
  }
  const res = await get(`${url}/auth/v1/health`, {});
  if (res.networkError) return `Couldn't reach that address (${res.networkError}). Check the URL and your connection.`;
  if (res.status >= 500) return `Supabase answered ${res.status}. Is the project still starting up? Wait a minute and retry.`;
  return null;
}

async function checkAnon(url, key) {
  if (key.startsWith("sb_secret_")) return "That's the secret key. Here we need the publishable (or legacy anon) key.";
  const res = await get(`${url}/auth/v1/settings`, keyHeaders(key));
  if (res.networkError) return `Couldn't reach Supabase (${res.networkError}). Check your connection and try again.`;
  if (res.status === 401 || res.status === 403) return `Key rejected (${res.status}). Copy the publishable key (sb_publishable_…) or the legacy "anon" key.`;
  if (!res.ok) return `Unexpected answer ${res.status} from Supabase.`;
  return null;
}

async function checkService(url, key) {
  if (key.startsWith("sb_publishable_")) return "That's the publishable key. Here we need the secret key (sb_secret_…) or the legacy service_role key.";
  const res = await get(`${url}/auth/v1/admin/users?page=1&per_page=1`, keyHeaders(key));
  if (res.networkError) return `Couldn't reach Supabase (${res.networkError}). Check your connection and try again.`;
  if (res.status === 401 || res.status === 403) {
    return `Key rejected (${res.status}). Copy the secret key (sb_secret_…) or the legacy "service_role" key.`;
  }
  if (!res.ok) return `Unexpected answer ${res.status} from Supabase.`;
  return null;
}

async function checkDbUrl(dbUrl, projectRef) {
  if (!/^postgres(ql)?:\/\//.test(dbUrl)) return "Should start with postgresql://";
  if (/@db\.[a-z0-9]+\.supabase\.co/.test(dbUrl)) {
    return 'That is the direct connection, which needs IPv6. Use the "Session pooler" string instead (Connect › Session pooler).';
  }
  if (dbUrl.includes("[YOUR-PASSWORD]")) return "Replace [YOUR-PASSWORD] with your database password.";
  if (projectRef && !dbUrl.includes(projectRef)) return `This string isn't for project ${projectRef}. Copy it from the same project.`;
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
  try {
    await client.connect();
    await client.query("select 1");
    return null;
  } catch (err) {
    if (/password authentication failed/i.test(err.message)) return "Wrong database password.";
    return `Couldn't connect: ${err.message}`;
  } finally {
    await client.end().catch(() => {});
  }
}

const WEAK_PINS = new Set(["123456", "654321", "000000", "111111", "121212", "112233", "123123", "999999", "123321"]);

function checkPin(pin) {
  if (!/^\d{6,12}$/.test(pin)) return "Use 6 to 12 digits.";
  if (/^(\d)\1+$/.test(pin)) return "All the same digit is too easy to guess.";
  const digits = [...pin].map(Number);
  const step = digits[1] - digits[0];
  if (Math.abs(step) === 1 && digits.every((d, i) => i === 0 || d - digits[i - 1] === step)) return "A counting sequence is too easy to guess.";
  if (WEAK_PINS.has(pin)) return "That's one of the most common PINs. Pick another.";
  if (/^(19|20)\d{2}$/.test(pin.slice(-4)) && pin.length === 6) return "Ending in a year (like a birth year) is easy to guess.";
  return null;
}

function vapidKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pub = publicKey.export({ format: "jwk" });
  const priv = privateKey.export({ format: "jwk" });
  const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, "base64url"), Buffer.from(pub.y, "base64url")]);
  return { publicKey: raw.toString("base64url"), privateKey: priv.d };
}

function ghSecret(name, value) {
  const r = spawnSync("gh", ["secret", "set", name, "--repo", REPO], { input: value, encoding: "utf8", shell: false });
  return r.status === 0 ? null : (r.stderr || "gh failed").trim();
}

// ---------------------------------------------------------------- main

const env = readEnv();
// Save each answer as soon as it checks out, so quitting halfway loses nothing.
const save = (key, value) => {
  env[key] = value;
  writeEnv(env);
};
console.log("Kimemiah family app setup");
console.log(`Values are saved to ${ENV_FILE} (git-ignored). Secret answers are shown as *.`);

const url = await askChecked("Supabase Project URL", {
  current: env.NEXT_PUBLIC_SUPABASE_URL,
  check: checkUrl,
  clean: normaliseUrl,
  help: "Supabase dashboard › your project › Project Settings › API › Project URL",
});
save("NEXT_PUBLIC_SUPABASE_URL", url);
const projectRef = url.match(/^https:\/\/([a-z0-9]{20})\./)?.[1];

const anon = await askChecked("Supabase anon (publishable) key", {
  hidden: true,
  current: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  check: (k) => checkAnon(url, k),
  help: 'Project Settings › API Keys › the publishable key (sb_publishable_…), or Legacy › "anon public".',
});
save("NEXT_PUBLIC_SUPABASE_ANON_KEY", anon);

const service = await askChecked("Supabase service_role (secret) key", {
  hidden: true,
  current: env.SUPABASE_SERVICE_ROLE_KEY,
  check: (k) => checkService(url, k),
  help: 'Same page › the secret key (sb_secret_…), or Legacy › "service_role". This one must never be shared.',
});
save("SUPABASE_SERVICE_ROLE_KEY", service);

// Accepts either the full Session pooler URI or just the database password.
const toDbUrl = (v) =>
  /^postgres(ql)?:\/\//.test(v.trim())
    ? v.trim()
    : `postgresql://postgres.${projectRef}:${encodeURIComponent(v)}@${POOLER_HOST}:5432/postgres`;

const dbUrl = await askChecked("Database password", {
  hidden: true,
  current: env.SUPABASE_DB_URL,
  check: (v) => checkDbUrl(v, projectRef),
  clean: (v) => (v === env.SUPABASE_DB_URL ? v : v ? toDbUrl(v) : ""),
  help: "The database password you set for this project (Project Settings › Database › Reset password if you've lost it).",
});
save("SUPABASE_DB_URL", dbUrl);

let pinHash = env.FAMILY_PIN_HASH;
console.log(pinHash ? "\nFamily PIN is already set. Type a new one to change it, or press Enter to keep it." : "\nChoose the family PIN (6+ digits). Everyone types it once on their phone.");
for (;;) {
  const pin = await prompt("Family PIN", { hidden: true });
  if (!pin && pinHash) {
    console.log("  ✓ Keeping the current PIN");
    break;
  }
  const problem = checkPin(pin);
  if (problem) {
    console.log(`  ✗ ${problem}`);
    continue;
  }
  const again = await prompt("Type the PIN again", { hidden: true });
  if (again !== pin) {
    console.log("  ✗ The two PINs didn't match. Try again.");
    continue;
  }
  const changed = Boolean(pinHash);
  pinHash = Buffer.from(bcrypt.hashSync(pin, 12)).toString("base64");
  console.log("  ✓ PIN saved (only a scrambled hash is stored)");
  if (changed) console.log("  ! After deploying the new PIN, use Settings › Sign out every phone.");
  break;
}

let { VAPID_PUBLIC_KEY: vapidPublic, VAPID_PRIVATE_KEY: vapidPrivate } = env;
if (!vapidPublic || !vapidPrivate) {
  ({ publicKey: vapidPublic, privateKey: vapidPrivate } = vapidKeys());
  console.log("\n✓ Generated push alert keys");
}

const notifySecret = env.NOTIFY_SHARED_SECRET || crypto.randomBytes(32).toString("base64url");

let ageRecipient = env.BACKUP_AGE_RECIPIENT;
if (!ageRecipient) {
  const identity = await generateIdentity();
  ageRecipient = await identityToRecipient(identity);
  const dir = path.join(os.homedir(), ".kimemiah");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "backup-identity.txt");
  fs.writeFileSync(file, `# Kimemiah backup key. Needed to open backups. Keep it safe.\n${identity}\n`, { mode: 0o600 });
  console.log(`\n✓ Generated the backup key and saved it to ${file}`);
  console.log("  Copy that file's contents into your password manager. Without it, backups can't be opened.");
}

writeEnv(
  {
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,
    SUPABASE_SERVICE_ROLE_KEY: service,
    SUPABASE_DB_URL: dbUrl,
    FAMILY_PIN_HASH: pinHash,
    VAPID_PUBLIC_KEY: vapidPublic,
    VAPID_PRIVATE_KEY: vapidPrivate,
    NOTIFY_SHARED_SECRET: notifySecret,
    BACKUP_AGE_RECIPIENT: ageRecipient,
  },
  {
    FAMILY_PIN_HASH: "bcrypt hash of the family PIN, base64-encoded",
    BACKUP_AGE_RECIPIENT: "public half of the backup key (the private half stays in ~/.kimemiah)",
  },
);
console.log(`\n✓ Saved ${ENV_FILE}`);

const toGitHub = await prompt(`\nCopy the backup settings to GitHub secrets for ${REPO}? (y/N)`);
if (/^y/i.test(toGitHub)) {
  for (const [name, value] of [
    ["SUPABASE_DB_URL", dbUrl],
    ["BACKUP_AGE_RECIPIENT", ageRecipient],
    ["SUPABASE_URL", url],
    ["SUPABASE_ANON_KEY", anon],
  ]) {
    const err = ghSecret(name, value);
    console.log(err ? `  ✗ ${name}: ${err}` : `  ✓ ${name}`);
  }
}

console.log("\nDone. Next: npm run db:migrate");
