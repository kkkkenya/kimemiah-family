"use client";

// Turning push alerts on and off for this phone, and asking the server to send right away.
import { supabase } from "@/lib/supabase/client";

export type PushState = "unsupported" | "needs_install" | "blocked" | "off" | "on";

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const installed = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

export async function pushState(): Promise<PushState> {
  if (typeof window === "undefined") return "unsupported";
  // iPhones only get alerts from the app added to the Home Screen (iOS 16.4+).
  if (isIos() && !installed()) return "needs_install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function save(sub: PushSubscription, enabled: boolean): Promise<string | null> {
  const json = sub.toJSON();
  const { error } = await supabase().rpc("save_push_subscription", {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys?.p256dh,
    p_auth: json.keys?.auth,
    p_enabled: enabled,
  });
  return error ? "Couldn't save. Check your connection and try again." : null;
}

/** Ask permission, subscribe and save this phone's push address. Returns an error message or null. */
export async function turnOn(): Promise<string | null> {
  if ((await Notification.requestPermission()) !== "granted") return "Alerts are blocked. Allow notifications for this app in the phone's settings.";
  const res = await fetch("/api/push/key");
  if (!res.ok) return "Alerts aren't set up on the server yet.";
  const { key } = (await res.json()) as { key: string };
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
  return save(sub, true);
}

export async function turnOff(): Promise<string | null> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return null;
  const err = await save(sub, false);
  await sub.unsubscribe();
  return err;
}

/** Send any due alerts now (after posting an urgent job or handing one over). Best effort. */
export async function sendAlertsNow(): Promise<void> {
  try {
    const { data } = await supabase().auth.getSession();
    const token = data.session?.access_token;
    if (token) await fetch("/api/push/tick", { method: "POST", headers: { authorization: `Bearer ${token}` } });
  } catch {}
}

/** "Send me a test": one notification to this phone. Returns what happened, in plain words. */
export async function sendTest(): Promise<string> {
  try {
    const { data } = await supabase().auth.getSession();
    const token = data.session?.access_token;
    if (!token) return "This phone isn't unlocked. Reopen the app and try again.";
    const res = await fetch("/api/push/test", { method: "POST", headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) return "The test couldn't be sent. Check your signal and try again.";
    const { sent } = (await res.json()) as { sent: number };
    return sent ? "Sent. It should pop up in a few seconds." : "Saved in the bell, but this phone has no alert address yet. Turn notifications on first.";
  } catch {
    return "The test needs signal. Try again when you're online.";
  }
}
