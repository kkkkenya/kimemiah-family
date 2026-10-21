import "server-only";
import { createHash } from "node:crypto";

export const LIMITS = {
  perIp: 5, // failures per IP
  perIpWindowMin: 15,
  global: 30, // failures from anywhere
  globalWindowMin: 60,
};

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

// IPs are stored hashed, salted with a server secret.
export function hashIp(ip: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

export function deviceLabel(userAgent: string | null): string {
  const ua = userAgent ?? "";
  const os = /iPhone|iPad/.test(ua)
    ? "iPhone"
    : /Android/.test(ua)
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X/.test(ua)
          ? "Mac"
          : "Phone";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : /Firefox\//.test(ua)
            ? "Firefox"
            : "browser";
  return `${os} · ${browser}`;
}
