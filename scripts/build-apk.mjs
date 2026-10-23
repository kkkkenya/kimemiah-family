// Builds the Android app: a Trusted Web Activity that opens kimemiah-family.vercel.app
// full screen, so it updates with every deploy. Rebuild only to change the icon, name or colours.
//
//   npm run apk            (bump appVersionCode in android/twa-manifest.json first for an update)
//
// Needs the JDK and Android SDK that Bubblewrap uses (~/.bubblewrap). The signing key lives in
// android/kimemiah.keystore (never committed); its password is made once and kept in .env.local.
// Keep both safe: without them, phones can't update the app, only uninstall and reinstall it.
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readEnv, writeEnv } from "./env.mjs";

const root = process.cwd();
const dir = path.join(root, "android");
const home = path.join(os.homedir(), ".bubblewrap");
const jdk = path.join(home, "jdk", fs.readdirSync(path.join(home, "jdk"))[0]);
const keytool = path.join(jdk, "bin", "keytool.exe");
const keystore = path.join(dir, "kimemiah.keystore");
// Bubblewrap runs gradlew.bat from the project folder, which Windows refuses when this is set.
const { NoDefaultCurrentDirectoryInExePath: _blocked, ...baseEnv } = process.env;
const run = (cmd, args, env = {}) => execFileSync(cmd, args, { cwd: dir, stdio: "inherit", shell: true, env: { ...baseEnv, PATH: `${path.join(jdk, "bin")}${path.delimiter}${baseEnv.PATH ?? baseEnv.Path ?? ""}`, ...env } });

fs.writeFileSync(path.join(home, "config.json"), JSON.stringify({ jdkPath: jdk, androidSdkPath: path.join(home, "android_sdk") }));

const env = readEnv();
if (!env.APK_KEYSTORE_PASSWORD) {
  if (fs.existsSync(keystore)) {
    console.error("android/kimemiah.keystore exists but APK_KEYSTORE_PASSWORD is missing from .env.local. Restore it from your backup.");
    process.exit(1);
  }
  env.APK_KEYSTORE_PASSWORD = crypto.randomBytes(18).toString("base64url");
  writeEnv(env);
  console.log("Made a signing password and saved it in .env.local as APK_KEYSTORE_PASSWORD.");
}
const pw = env.APK_KEYSTORE_PASSWORD;

if (!fs.existsSync(keystore)) {
  execFileSync(keytool, ["-genkeypair", "-v", "-keystore", keystore, "-alias", "kimemiah", "-keyalg", "RSA", "-keysize", "2048", "-validity", "10000", "-storepass", pw, "-keypass", pw, "-dname", "CN=Kimemiah Home, O=Kimemiah family, C=KE"], { stdio: "inherit" });
}

const fresh = !fs.existsSync(path.join(root, "public", "kimemiah.apk")); // first release keeps version 1
const secrets = { BUBBLEWRAP_KEYSTORE_PASSWORD: pw, BUBBLEWRAP_KEY_PASSWORD: pw };
run("npx", ["--yes", "@bubblewrap/cli@1.27.0", "update", ...(fresh ? ["--skipVersionUpgrade"] : []), "--manifest=./twa-manifest.json"], secrets);
run("npx", ["--yes", "@bubblewrap/cli@1.27.0", "build", "--skipPwaValidation", "--manifest=./twa-manifest.json"], secrets);

// The download, and the link that lets Android open the site without an address bar.
fs.copyFileSync(path.join(dir, "app-release-signed.apk"), path.join(root, "public", "kimemiah.apk"));
const out = execFileSync(keytool, ["-list", "-v", "-keystore", keystore, "-alias", "kimemiah", "-storepass", pw], { encoding: "utf8" });
const sha = out.match(/SHA256:\s*([0-9A-F:]+)/)[1];
const manifest = JSON.parse(fs.readFileSync(path.join(dir, "twa-manifest.json"), "utf8"));
fs.mkdirSync(path.join(root, "public", ".well-known"), { recursive: true });
fs.writeFileSync(
  path.join(root, "public", ".well-known", "assetlinks.json"),
  JSON.stringify([{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: manifest.packageId, sha256_cert_fingerprints: [sha] } }], null, 2) + "\n",
);
console.log(`\nDone: public/kimemiah.apk (version ${manifest.appVersionCode}) and public/.well-known/assetlinks.json`);
