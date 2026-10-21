// Runs the launch security checklist against the real Supabase project.
// Creates a throwaway test phone and member, checks what they can and can't do,
// then removes everything it made. Usage: npm run check:security
import fs from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { readEnv, requireEnv } from "./env.mjs";

const env = readEnv();
requireEnv(env, ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);

const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL, env.SUPABASE_SERVICE_ROLE_KEY, opts);
const anon = () => createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, opts);

const TABLES = [
  "members", "devices", "settings", "shops", "stock_items", "stock_movements", "shopping_trips", "shopping_extras",
  "trip_lines", "jobs", "thanks", "budget_categories", "money_entries", "budgets", "meetings", "agenda_items",
  "decisions", "meals", "meal_ingredients", "meal_slots", "contacts", "activity", "audit_log", "auth_failures",
  "push_subscriptions", "applied_mutations",
];

let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${!ok && detail ? ` (${detail})` : ""}`);
  if (!ok) failed++;
}

async function visibleRows(client, table) {
  const { data, error } = await client.from(table).select("*").limit(5);
  return error ? 0 : (data?.length ?? 0);
}

const made = { users: [], memberId: null, rows: [] };

try {
  console.log("Anonymous key, no sign-in");
  const nobody = anon();
  let leaks = [];
  for (const t of TABLES) if ((await visibleRows(nobody, t)) > 0) leaks.push(t);
  check("every table returns nothing", leaks.length === 0, leaks.join(", "));
  const { error: anonInsert } = await nobody.from("contacts").insert({ id: randomUUID(), name: "x" });
  check("can't add anything", Boolean(anonInsert));
  const { error: anonRpc } = await nobody.rpc("apply_mutations", { mutations: [] });
  check("can't call the sync function", Boolean(anonRpc));

  // A throwaway phone, signed in the same way /api/unlock does it.
  const email = `device-${randomUUID()}@devices.kimemiah.invalid`;
  const password = randomBytes(24).toString("base64url");
  const { data: created, error: createErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (createErr) throw createErr;
  made.users.push(created.user.id);
  const phone = anon();
  const { error: signInErr } = await phone.auth.signInWithPassword({ email, password });
  if (signInErr) throw signInErr;

  console.log("Signed in, but PIN never entered (no device row)");
  leaks = [];
  for (const t of TABLES) if ((await visibleRows(phone, t)) > 0) leaks.push(t);
  check("sees nothing", leaks.length === 0, leaks.join(", "));

  await admin.from("devices").insert({ id: created.user.id, label: "security check" });

  console.log("Unlocked, name not picked yet");
  check("can see the list of names", (await visibleRows(phone, "members")) > 0);
  check("can't see house data", (await visibleRows(phone, "settings")) === 0 && (await visibleRows(phone, "shops")) === 0);
  const { error: noMemberSync } = await phone.rpc("apply_mutations", { mutations: [] });
  check("can't sync changes", noMemberSync?.code === "42501", noMemberSync?.message);

  const memberId = randomUUID();
  await admin.from("members").insert({ id: memberId, name: "Security check (temporary)", sort: 999 });
  made.memberId = memberId;
  const { error: pickErr } = await phone.rpc("set_device_member", { p_member: memberId });
  check("can pick a name", !pickErr, pickErr?.message);

  console.log("Unlocked with a name");
  check("can read house data", (await visibleRows(phone, "shops")) > 0);

  const moneyId = randomUUID();
  const mutationId = randomUUID();
  const forged = randomUUID();
  const send = (mutations) => phone.rpc("apply_mutations", { mutations });
  const { data: r1, error: e1 } = await send([
    { id: mutationId, table: "money_entries", op: "insert", row: { id: moneyId, direction: "out", amount_kes: 1, note: "security check", actor_id: forged } },
  ]);
  check("can add a money entry", !e1 && r1?.applied?.includes(mutationId), e1?.message ?? JSON.stringify(r1?.rejected));
  made.rows.push(["money_entries", moneyId]);

  const { data: money } = await admin.from("money_entries").select("actor_id").eq("id", moneyId).single();
  check("'who did it' is set by the server, not the phone", money?.actor_id === memberId, `got ${money?.actor_id}`);

  const { data: r2 } = await send([
    { id: mutationId, table: "money_entries", op: "insert", row: { id: randomUUID(), direction: "out", amount_kes: 999 } },
  ]);
  const { count: moneyCount } = await admin.from("money_entries").select("id", { count: "exact", head: true }).eq("note", "security check");
  check("a change sent twice counts once", r2?.applied?.includes(mutationId) && moneyCount === 1, `count ${moneyCount}`);

  const { data: r3 } = await send([
    { id: randomUUID(), table: "money_entries", op: "update", row: { id: moneyId, amount_kes: 5 } },
    { id: randomUUID(), table: "money_entries", op: "delete", row: { id: moneyId } },
    { id: randomUUID(), table: "devices", op: "update", row: { id: created.user.id, revoked_at: null } },
  ]);
  check("money can't be edited or removed through sync, and unknown tables are refused", r3?.rejected?.length === 3, JSON.stringify(r3));

  const { error: directUpdate } = await phone.from("money_entries").update({ amount_kes: 5 }).eq("id", moneyId);
  const { data: after } = await admin.from("money_entries").select("amount_kes").eq("id", moneyId).single();
  check("money can't be edited directly", Boolean(directUpdate) || Number(after?.amount_kes) === 1, directUpdate?.message);
  const { error: directDelete } = await phone.from("money_entries").delete().eq("id", moneyId);
  const { data: stillThere } = await admin.from("money_entries").select("id").eq("id", moneyId).maybeSingle();
  check("money can't be deleted directly", Boolean(directDelete) || Boolean(stillThere));

  const jobId = randomUUID();
  await send([{ id: randomUUID(), table: "jobs", op: "insert", row: { id: jobId, title: "Security check job" } }]);
  made.rows.push(["jobs", jobId]);
  const { error: claimDirect } = await phone.from("jobs").update({ claimed_by: memberId }).eq("id", jobId);
  check("jobs can't be claimed by editing the row (claims go through the server check)", Boolean(claimDirect), "update was allowed");

  const { data: audit } = await admin.from("audit_log").select("device_id, actor_id").eq("row_id", moneyId);
  check("every change is in the audit log with the phone and person", audit?.[0]?.device_id === created.user.id && audit?.[0]?.actor_id === memberId);

  console.log("Phone signed out");
  await admin.from("devices").update({ revoked_at: new Date().toISOString() }).eq("id", created.user.id);
  check("loses access on its very next request", (await visibleRows(phone, "shops")) === 0);
  const { error: revokedSync } = await phone.rpc("apply_mutations", { mutations: [] });
  check("can't sync", revokedSync?.code === "42501");

  console.log("App bundle");
  const staticDir = path.resolve(".next/static");
  if (!fs.existsSync(staticDir)) {
    console.log("  - skipped: run `npm run build` first");
  } else {
    const secrets = ["SUPABASE_SERVICE_ROLE_KEY", "FAMILY_PIN_HASH", "VAPID_PRIVATE_KEY", "NOTIFY_SHARED_SECRET", "SUPABASE_DB_URL"]
      .map((k) => env[k])
      .filter(Boolean);
    const hits = [];
    const walk = (dir) => {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, f.name);
        if (f.isDirectory()) walk(p);
        else if (secrets.some((s) => fs.readFileSync(p, "utf8").includes(s))) hits.push(p);
      }
    };
    walk(staticDir);
    check("no server secrets in the files phones download", hits.length === 0, hits.join(", "));
  }
} catch (err) {
  console.error(`\nCheck stopped: ${err.message}`);
  failed++;
} finally {
  // Remove everything this run made (service role can hard-delete).
  for (const [table, id] of made.rows) await admin.from(table).delete().eq("id", id);
  if (made.rows.length) await admin.from("audit_log").delete().in("row_id", made.rows.map(([, id]) => id));
  for (const id of made.users) {
    await admin.from("devices").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id);
  }
  if (made.memberId) {
    await admin.from("audit_log").delete().eq("row_id", made.memberId);
    await admin.from("members").delete().eq("id", made.memberId);
  }
}

console.log(failed ? `\n${failed} check(s) failed.` : "\nAll security checks passed.");
process.exit(failed ? 1 : 0);
