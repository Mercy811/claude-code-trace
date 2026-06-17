// Light/dark theme mode: persistence + application to the document.
// Web-focused — the preference lives in localStorage and is applied by
// toggling `data-theme` on the document root, which switches the CSS
// variable palette defined in global.css.

export type ThemeMode = "dark" | "light";

export const THEME_STORAGE_KEY = "cctrace-theme";

/** The default theme when nothing is persisted. */
export const DEFAULT_THEME: ThemeMode = "dark";

/** Read the persisted theme, falling back to the default. */
export function getStoredTheme(): ThemeMode {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : DEFAULT_THEME;
  } catch {
    // localStorage may be unavailable (private mode, SSR, etc.)
    return DEFAULT_THEME;
  }
}

/** Persist the theme preference. Silently ignores storage failures. */
export function storeTheme(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // ignore
  }
}

/** Apply the theme to the document root so the CSS palette switches. */
export function applyTheme(mode: ThemeMode): void {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = mode;
  }
}

/** Read the persisted theme and apply it. Returns the applied mode. */
export function initTheme(): ThemeMode {
  const mode = getStoredTheme();
  applyTheme(mode);
  return mode;
}

/** Persist and apply the theme in one call. */
export function setTheme(mode: ThemeMode): void {
  storeTheme(mode);
  applyTheme(mode);
}
