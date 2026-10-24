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

/**
 * Switch colours with transitions off: Safari doesn't run a transition started by a colour
 * variable changing, so links and buttons (which fade colour on tap) kept their old colours.
 */
function withoutTransitions(change: () => void) {
  const root = document.documentElement;
  root.classList.add("theme-switch");
  change();
  void getComputedStyle(root).color; // apply the new colours now, while transitions are off
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-switch")));
}

export function applyTheme(t: ThemeChoice) {
  const root = document.documentElement;
  withoutTransitions(() => {
    if (t === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", t);
  });
  const dark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelector('meta[name="theme-color"]:not([media])')?.remove();
  const meta = document.createElement("meta");
  meta.name = "theme-color";
  meta.content = dark ? "#1A1919" : "#FFFFFF";
  document.head.appendChild(meta);
}

/**
 * Runs in <head> before anything draws. Kept tiny and dependency-free. Also: when the phone itself
 * switches light/dark, the colours change with transitions off (same Safari issue as above).
 */
export const THEME_BOOT = `try{var r=document.documentElement,t=localStorage.getItem("theme");if(t==="light"||t==="dark")r.setAttribute("data-theme",t);matchMedia("(prefers-color-scheme: dark)").addEventListener("change",function(){r.classList.add("theme-switch");getComputedStyle(r).color;requestAnimationFrame(function(){requestAnimationFrame(function(){r.classList.remove("theme-switch")})})})}catch(e){}`;
