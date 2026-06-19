import type { ApiCategory } from "./types.js";

/** Hardcoded, English-only category list — the source of truth for valid ids. */
export const CATEGORIES: { id: string; name: string }[] = [
  { id: "tools", name: "Tools" },
  { id: "productivity", name: "Productivity" },
  { id: "games", name: "Games" },
  { id: "multimedia", name: "Multimedia" },
  { id: "pim", name: "PIM" },
  { id: "files", name: "Files" },
  { id: "integration", name: "Integration" },
  { id: "security", name: "Security" },
  { id: "storage", name: "Storage" },
  { id: "collaboration", name: "Collaboration" },
  { id: "automation", name: "Automation" },
  { id: "customization", name: "Customization" },
];

/** Lower-cased category id → canonical id, for case-insensitive lookup. */
const CANONICAL_BY_LOWER = new Map(CATEGORIES.map((c) => [c.id.toLowerCase(), c.id]));

/**
 * Resolve a category id to its canonical form, matching case-insensitively, or
 * undefined if it is not a known category. Classic apps declare categories with
 * inconsistent casing (e.g. "Security" vs "security"); matching case-sensitively
 * would wrongly reject the capitalised variants.
 */
export function canonicalCategory(id: string): string | undefined {
  return CANONICAL_BY_LOWER.get(id.trim().toLowerCase());
}

export function isValidCategory(id: string): boolean {
  return canonicalCategory(id) !== undefined;
}

export function toApiCategories(): ApiCategory[] {
  return CATEGORIES.map((c) => ({ id: c.id, translations: { en: { name: c.name } } }));
}
