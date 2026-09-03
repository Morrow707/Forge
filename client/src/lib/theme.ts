const THEME_KEY = "forge:theme";

export type Theme = "dark" | "light";

/** Dark is Forge's real, decided default (see index.css's own comment on
 * the palette) -- anything other than an explicit "light" stays dark,
 * including a first-ever visit with nothing in localStorage yet. */
export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    return window.localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

/** Toggles the .light class index.css's :root.light block reads -- no
 * class at all (the common case) falls through to the plain :root dark
 * palette, so this only ever needs to ADD the class for light, never a
 * separate .dark class for the default. Exported on its own (not just
 * bundled into setTheme below) so index.html's inline zero-flash script
 * and this module apply the exact same class, not two copies that could
 * drift apart. */
export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("light", theme === "light");
}

export function setTheme(theme: Theme) {
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage full/unavailable (private browsing, etc) -- the toggle still
    // applies for this tab, it just won't persist across reloads.
  }
  applyTheme(theme);
}
