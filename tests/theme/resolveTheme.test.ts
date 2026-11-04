import { describe, expect, it } from "vitest";

import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  resolveTheme,
} from "../../lib/theme/theme";

describe("resolveTheme", () => {
  it("accepts the three supported themes", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("natural")).toBe("natural");
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("falls back to Natural for unknown or invalid preferences", () => {
    expect(resolveTheme("banana")).toBe(DEFAULT_THEME);
    expect(resolveTheme("system")).toBe(DEFAULT_THEME);
    expect(resolveTheme("DARK")).toBe(DEFAULT_THEME);
    expect(resolveTheme(" dark ")).toBe(DEFAULT_THEME);
    expect(resolveTheme("")).toBe(DEFAULT_THEME);
    expect(resolveTheme(null)).toBe(DEFAULT_THEME);
    expect(resolveTheme(undefined)).toBe(DEFAULT_THEME);
    expect(resolveTheme(0)).toBe(DEFAULT_THEME);
    expect(resolveTheme({})).toBe(DEFAULT_THEME);
    expect(resolveTheme(["dark"])).toBe(DEFAULT_THEME);
  });

  it("uses a namespaced appearance-only storage key", () => {
    expect(THEME_STORAGE_KEY).toBe("homewise-theme");
    expect(DEFAULT_THEME).toBe("natural");
  });
});
