import { describe, it, expect, beforeEach } from "vitest";
import {
  THEME_STORAGE_KEY,
  DEFAULT_THEME,
  getStoredTheme,
  storeTheme,
  applyTheme,
  initTheme,
  setTheme,
} from "./themeMode";

describe("themeMode", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  describe("getStoredTheme", () => {
    it("defaults to dark when nothing is persisted", () => {
      expect(getStoredTheme()).toBe(DEFAULT_THEME);
      expect(getStoredTheme()).toBe("dark");
    });

    it("returns light when light is persisted", () => {
      localStorage.setItem(THEME_STORAGE_KEY, "light");
      expect(getStoredTheme()).toBe("light");
    });

    it("falls back to dark for unrecognized values", () => {
      localStorage.setItem(THEME_STORAGE_KEY, "neon");
      expect(getStoredTheme()).toBe("dark");
    });
  });

  describe("storeTheme", () => {
    it("persists the theme to localStorage", () => {
      storeTheme("light");
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
      storeTheme("dark");
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    });
  });

  describe("applyTheme", () => {
    it("sets data-theme on the document root", () => {
      applyTheme("light");
      expect(document.documentElement.dataset.theme).toBe("light");
      applyTheme("dark");
      expect(document.documentElement.dataset.theme).toBe("dark");
    });
  });

  describe("initTheme", () => {
    it("applies and returns the persisted theme", () => {
      localStorage.setItem(THEME_STORAGE_KEY, "light");
      expect(initTheme()).toBe("light");
      expect(document.documentElement.dataset.theme).toBe("light");
    });

    it("applies the default when nothing is persisted", () => {
      expect(initTheme()).toBe("dark");
      expect(document.documentElement.dataset.theme).toBe("dark");
    });
  });

  describe("setTheme", () => {
    it("persists and applies in one call", () => {
      setTheme("light");
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
      expect(document.documentElement.dataset.theme).toBe("light");
    });
  });
});
