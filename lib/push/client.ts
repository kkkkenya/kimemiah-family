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

/** Waits for a step, but never forever: a phone that doesn't answer gets a clear message instead. */
function inTime<T>(p: Promise<T>, ms: number): Promise<T | "timeout"> {
  return Promise.race([p, new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), ms))]);
}

/** The app's service worker, starting it if the phone hasn't yet. */
async function worker(): Promise<ServiceWorkerRegistration | null> {
  const ready = await inTime(navigator.serviceWorker.ready, 8000);
  if (ready !== "timeout") return ready;
  try {
    await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
  const again = await inTime(navigator.serviceWorker.ready, 15000);
  return again === "timeout" ? null : again;
}

export type Step = "asking" | "starting" | "connecting" | "saving";

/**
 * Ask permission, subscribe and save this phone's push address, saying which step it's on.
 * Every step has a time limit, so the button never sticks on "One moment".
 * Returns an error message, or null when it worked.
 */
export async function turnOn(onStep: (s: Step) => void = () => {}): Promise<string | null> {
  onStep("asking");
  const answer = Notification.permission === "granted" ? "granted" : await inTime(Notification.requestPermission(), 25000);
  if (answer === "timeout")
    return "Your phone didn't show the question. On Android, look for a small bell in the address bar and tap it, or allow notifications in the phone's settings (see step 2), then tap Turn on again.";
  if (answer !== "granted") return "Notifications are blocked for this app. Allow them in the phone's settings (see step 2), then tap Turn on again.";

  onStep("starting");
  const reg = await worker();
  if (!reg) return "The app couldn't start its background helper. Close the app fully, open it again, and tap Turn on again.";

  onStep("connecting");
  let key: string;
  try {
    const res = await inTime(fetch("/api/push/key"), 15000);
    if (res === "timeout" || !res.ok) return "Couldn't reach the server. Check your signal and try again.";
    key = ((await res.json()) as { key: string }).key;
  } catch {
    return "Couldn't reach the server. Check your signal and try again.";
  }
  let sub: PushSubscription | null;
  try {
    const existing = await reg.pushManager.getSubscription();
    const made = existing ?? (await inTime(reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }), 25000));
    if (made === "timeout") return "The phone's notification service didn't answer. Check the phone has signal (and on Android, that Google Play services is up to date), then try again. Reset below can help.";
    sub = made;
  } catch {
    return "The phone refused to set up notifications. Tap Reset below, then Turn on again.";
  }

  onStep("saving");
  const saved = await inTime(save(sub, true), 15000);
  return saved === "timeout" ? "Couldn't save. Check your signal and try again." : saved;
}

/** Start over on this phone: forget its push address and restart the background helper. */
export async function resetPush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await inTime(save(sub, false), 8000);
      await sub.unsubscribe();
    }
    await reg?.unregister();
  } catch {}
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
