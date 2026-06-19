import { describe, it, expect } from "vitest";
import {
  CATEGORIES,
  canonicalCategory,
  isValidCategory,
  toApiCategories,
} from "../src/categories.js";

describe("categories", () => {
  it("exposes a non-empty hardcoded list with the 'tools' category", () => {
    expect(CATEGORIES.length).toBeGreaterThan(0);
    expect(CATEGORIES.find((c) => c.id === "tools")).toBeTruthy();
  });

  it("validates known and unknown category ids", () => {
    expect(isValidCategory("tools")).toBe(true);
    expect(isValidCategory("nonsense")).toBe(false);
  });

  it("matches category ids case-insensitively (classic apps declare 'Security')", () => {
    expect(isValidCategory("Security")).toBe(true);
    expect(isValidCategory("SECURITY")).toBe(true);
    expect(isValidCategory(" Security ")).toBe(true);
  });

  it("canonicalises to the lowercase id, or returns undefined for unknowns", () => {
    expect(canonicalCategory("Security")).toBe("security");
    expect(canonicalCategory("tools")).toBe("tools");
    expect(canonicalCategory(" PIM ")).toBe("pim");
    expect(canonicalCategory("storage")).toBeUndefined();
  });

  it("emits English-only API category shape", () => {
    const api = toApiCategories();
    expect(api[0]).toHaveProperty("translations.en.name");
    const tools = api.find((c) => c.id === "tools");
    expect(tools).toEqual({ id: "tools", translations: { en: { name: "Tools" } } });
  });
});
