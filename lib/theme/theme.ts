// Appearance-theme resolution (T3d.3-I). Pure and environment-free so it
// is unit-testable and safe to mirror in the pre-hydration init script.
// Appearance preference ONLY: financial inputs, results, provenance, and
// AI content must never use this key or any browser storage.

export const THEME_STORAGE_KEY = "homewise-theme";

export const THEMES = ["light", "natural", "dark"] as const;

export type ThemeName = (typeof THEMES)[number];

export const DEFAULT_THEME: ThemeName = "natural";

// Unknown, missing, or malformed values fall back to Natural. Never throws.
export function resolveTheme(value: unknown): ThemeName {
  if (value === "light" || value === "natural" || value === "dark") {
    return value;
  }
  return DEFAULT_THEME;
}
