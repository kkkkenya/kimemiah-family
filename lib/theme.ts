// Light, dark, or follow the phone. Kept on this phone only, and applied before the page draws
// (see the script in app/layout.tsx) so it never flashes the wrong colours.
export type ThemeChoice = "system" | "light" | "dark";
const KEY = "theme";

export function getTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function setTheme(t: ThemeChoice) {
  try {
    if (t === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch {}
  applyTheme(t);
}

export function applyTheme(t: ThemeChoice) {
  const root = document.documentElement;
  if (t === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", t);
  const dark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelector('meta[name="theme-color"]:not([media])')?.remove();
  const meta = document.createElement("meta");
  meta.name = "theme-color";
  meta.content = dark ? "#1A1919" : "#FFFFFF";
  document.head.appendChild(meta);
}

/** Runs in <head> before anything draws. Kept tiny and dependency-free. */
export const THEME_BOOT = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
