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
];

const IDS = new Set(CATEGORIES.map((c) => c.id));

export function isValidCategory(id: string): boolean {
  return IDS.has(id);
}

export function toApiCategories(): ApiCategory[] {
  return CATEGORIES.map((c) => ({ id: c.id, translations: { en: { name: c.name } } }));
}
