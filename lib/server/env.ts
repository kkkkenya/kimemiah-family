import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Run: npm run setup`);
  return value;
}

export const serverEnv = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  anonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  serviceKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  // Stored base64-encoded so the "$" signs in a bcrypt hash survive .env expansion.
  pinHash: () => Buffer.from(required("FAMILY_PIN_HASH"), "base64").toString("utf8"),
};
